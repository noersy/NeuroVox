import { App, Modal, Notice, Platform, MarkdownView, Editor, EditorPosition } from 'obsidian';
import { AudioRecordingManager } from '../utils/RecordingManager';
import { RecordingUI, RecordingState } from '../ui/RecordingUI';
import NeuroVoxPlugin from '../main';
import { StreamingTranscriptionService } from '../utils/transcription/StreamingTranscriptionService';
import { DeviceDetection } from '../utils/DeviceDetection';
import { ChunkMetadata } from '../types';

interface TimerConfig {
    maxDuration: number;
    warningThreshold: number;
    updateInterval: number;
    chunkDuration: number;  // Duration in ms for each recording chunk
}

/**
 * Modal for managing audio recording with timer and controls.
 * Handles recording state, UI updates, and proper cleanup on close.
 */
export class TimerModal extends Modal {
    private recordingManager: AudioRecordingManager;
    private ui: RecordingUI;
    private intervalId: number | null = null;
    private seconds: number = 0;
    private isClosing: boolean = false;
    private currentState: RecordingState = 'inactive';
    private streamingService: StreamingTranscriptionService | null = null;
    private deviceDetection: DeviceDetection;
    private useStreaming: boolean = false;
    private chunkIndex: number = 0;
    private recordingStartTime: number = 0;
    
    // Live Preview properties
    private editor: Editor | null = null;
    private previewStart: EditorPosition | null = null;
    private previewEnd: EditorPosition | null = null;
    private lastLiveText: string = "";

    private readonly CONFIG: TimerConfig;

    public onStop: (result: Blob | string) => void;

    constructor(private plugin: NeuroVoxPlugin) {
        super(plugin.app);
        this.recordingManager = new AudioRecordingManager(plugin);
        this.deviceDetection = DeviceDetection.getInstance();
        
        // Configure based on device type
        const streamingOptions = this.deviceDetection.getOptimalStreamingOptions();
        this.useStreaming = this.deviceDetection.shouldUseStreamingMode();
        
        this.CONFIG = {
            maxDuration: 12 * 60,
            warningThreshold: 60,
            updateInterval: 1000,
            chunkDuration: streamingOptions.chunkDuration * 1000  // Convert to milliseconds
        };
        
        this.setupCloseHandlers();
    }

    // ... (setupCloseHandlers, close, requestClose, finalizeClose, onOpen, initializeRecording, isMobileDevice, isIOSDevice remain same) ...

    /**
     * Sets up handlers for modal closing via escape key, clicks, and touch events
     * 📱 Enhanced with proper mobile touch handling
     */
    private setupCloseHandlers(): void {
        // Prevent touch events from bubbling on modal content
        this.contentEl.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // Handle clicks/touches outside modal
        const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
            const target = event.target as HTMLElement;
            if (target === this.modalEl) {
                event.preventDefault();
                event.stopPropagation();
                void this.requestClose();
            }
        };

        // Desktop mouse events
        this.modalEl.addEventListener('click', handleOutsideInteraction);
        
        // Mobile touch events
        this.modalEl.addEventListener('touchstart', handleOutsideInteraction, { passive: false });
        this.modalEl.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

        // Handle escape key
        this.scope.register([], 'Escape', () => {
            void this.requestClose();
            return false;
        });

        // Handle mobile back button
        window.addEventListener('popstate', () => {
            void this.requestClose();
        });
    }

    /**
     * Override the built-in close method to use our custom close handler
     */
    close(): void {
        if (!this.isClosing) {
            void this.requestClose();
        }
    }

    /**
     * Handles all close attempts, ensuring proper cleanup and save prompts
     */
    private async requestClose(): Promise<void> {
        if (this.isClosing) return;
        this.isClosing = true;

        if (this.currentState === 'recording' || this.currentState === 'paused') {
            await this.handleStop();
        } else {
            await this.finalizeClose();
        }
    }

    /**
     * Performs final cleanup and closes the modal
     */
    private async finalizeClose(): Promise<void> {
        this.cleanup();
        this.isClosing = false;
        super.close();
    }

    /**
     * Initializes the modal with enhanced mobile support
     * 📱 Added mobile-specific meta tags and initialization
     */
    async onOpen(): Promise<void> {
        try {
            // Set viewport meta for mobile
            const viewport = document.querySelector('meta[name="viewport"]');
            if (!viewport) {
                const meta = document.createElement('meta');
                meta.name = 'viewport';
                meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                document.head.appendChild(meta);
            }

            const { contentEl } = this;
            contentEl.empty();
            contentEl.addClass('neurovox-timer-modal');

            // Add mobile-specific class
            if (this.isMobileDevice()) {
                contentEl.addClass('is-mobile');
            }

            const container = contentEl.createDiv({ 
                cls: 'neurovox-timer-content' 
            });

            this.ui = new RecordingUI(container, {
                onPause: () => this.handlePauseToggle(),
                onStop: () => this.handleStop()
            });

            // Initialize recording with mobile-specific settings
            await this.initializeRecording();
        } catch (error) {
            this.handleError('Failed to initialize recording', error);
        }
    }

    /**
     * Initializes recording with mobile-specific handling
     * 📱 Added device-specific audio configuration
     */
    private async initializeRecording(): Promise<void> {
        try {
            await this.recordingManager.initialize();
            await this.startRecording();
        } catch (error) {
            if (this.isIOSDevice() && error instanceof Error && error.name === 'NotAllowedError') {
                this.handleError('iOS requires microphone permission. Please enable it in Settings.', error);
            } else {
                this.handleError('Failed to initialize recording', error);
            }
        }
    }

    /**
     * Detects if current device is mobile using Obsidian's Platform API
     */
    private isMobileDevice(): boolean {
        return Platform.isMobile;
    }

    /**
     * Detects if current device is iOS using Obsidian's Platform API
     */
    private isIOSDevice(): boolean {
        return Platform.isIosApp || (Platform.isMobile && /iPhone|iPad|iPod/i.test(navigator.userAgent));
    }

    /**
     * Starts live preview insertion in the active editor
     */
    private startLivePreview(): void {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            this.editor = activeView.editor;
            const cursor = this.editor.getCursor();
            
            // Insert placeholder
            const placeholder = "> [!info] 🎙️ Live Transcription...\n> \n\n";
            this.editor.replaceRange(placeholder, cursor);
            
            // Track start and end of the content block (after the header)
            this.previewStart = { line: cursor.line + 1, ch: 2 }; // Skip "> "
            this.previewEnd = { line: cursor.line + 1, ch: 2 };
            this.lastLiveText = "";
        }
    }

    /**
     * Updates the live preview text
     */
    private updateLivePreview(text: string): void {
        if (!this.editor || !this.previewStart || !this.previewEnd) return;
        
        // Safety check: Ensure header is still there to prevent overwriting wrong text
        // if user shifted lines.
        try {
            const headerLine = this.previewStart.line - 1;
            const lineContent = this.editor.getLine(headerLine);
            if (!lineContent.includes("Live Transcription")) {
                console.warn("Live preview header missing, stopping updates.");
                this.editor = null; // Stop updates
                return;
            }
        } catch (e) {
            this.editor = null;
            return;
        }

        // Only update if text changed
        if (text === this.lastLiveText) return;
        this.lastLiveText = text;

        // Format text as callout body
        // We assume simple text for now, replacing newlines with callout prefix
        const formattedText = text.replace(/\n/g, "\n> ");
        
        try {
            this.editor.replaceRange(formattedText, this.previewStart, this.previewEnd);
            
            // Calculate new end position based on lines added
            const lines = formattedText.split('\n');
            const lastLineLength = lines[lines.length - 1].length;
            
            this.previewEnd = {
                line: this.previewStart.line + lines.length - 1,
                ch: (lines.length === 1 ? this.previewStart.ch : 0) + lastLineLength
            };
            
            // Scroll to bottom of transcription if needed
            this.editor.scrollIntoView({ from: this.previewEnd, to: this.previewEnd });
        } catch (e) {
            console.warn("Failed to update live preview", e);
            // If editor context is lost (e.g. user closed file), stop updating
            this.editor = null;
        }
    }

    /**
     * Removes the live preview block (to be replaced by final result)
     */
    private removeLivePreview(): void {
        if (!this.editor || !this.previewStart) return;
        
        // Calculate range to remove: from start of callout header to end of content
        // Header is one line above previewStart
        const headerLine = this.previewStart.line - 1;
        const startPos = { line: headerLine, ch: 0 };
        
        // End pos is previewEnd + 2 newlines we added?
        // We added "\n\n" at the end of placeholder.
        // Let's just remove up to previewEnd line + 1
        // Safe bet: remove the lines we touched.
        
        if (this.previewEnd) {
            const endPos = { line: this.previewEnd.line + 2, ch: 0 };
            try {
                this.editor.replaceRange("", startPos, endPos);
            } catch (e) {
                // Ignore if range invalid
            }
        }
        
        this.editor = null;
        this.previewStart = null;
        this.previewEnd = null;
    }

    /**
     * Starts or resumes recording with progressive chunk processing
     */
    private async startRecording(): Promise<void> {
        try {
            if (this.currentState === 'paused') {
                this.recordingManager.resume();
                this.resumeTimer();
            } else {
                // Initialize streaming service if using streaming mode
                if (this.useStreaming && !this.streamingService) {
                    // Start live preview in editor
                    this.startLivePreview();

                    this.streamingService = new StreamingTranscriptionService(
                        this.plugin,
                        {
                            onMemoryWarning: (usage) => {
                                new Notice(`Memory usage high: ${Math.round(usage)}%`);
                            },
                            onTranscriptionUpdate: (text) => {
                                this.updateLivePreview(text);
                            }
                        }
                    );
                }
                
                this.recordingStartTime = Date.now();
                this.chunkIndex = 0;
                
                // Configure recorder with chunk processing
                this.recordingManager.start({
                    timeSlice: this.CONFIG.chunkDuration,
                    onDataAvailable: async (blob: Blob) => {
                        await this.processAudioChunk(blob);
                    }
                });
                this.startTimer();
            }
            
            this.currentState = 'recording';
            this.ui.updateState(this.currentState);
            new Notice('Recording started');
        } catch (error) {
            this.handleError('Failed to start recording', error);
        }
    }

    // ... (processAudioChunk, handlePauseToggle, pauseRecording remain same) ...
    
    private async processAudioChunk(blob: Blob): Promise<void> {
        if (this.useStreaming && this.streamingService) {
            const metadata: ChunkMetadata = {
                id: `chunk_${this.chunkIndex}`,
                index: this.chunkIndex,
                duration: this.CONFIG.chunkDuration,
                timestamp: Date.now(),
                size: blob.size
            };
            
            const added = await this.streamingService.addChunk(blob, metadata);
            
            if (!added && this.streamingService.isQueuePaused()) {
                new Notice('Memory limit reached - processing chunks...');
            }
            
            this.chunkIndex++;
        }
    }

    private handlePauseToggle(): void {
        if (this.currentState === 'paused') {
            void this.startRecording();
        } else {
            this.pauseRecording();
        }
    }

    private pauseRecording(): void {
        try {
            this.recordingManager.pause();
            this.pauseTimer();
            
            this.currentState = 'paused';
            this.ui.updateState(this.currentState);
            new Notice('Recording paused');
        } catch (error) {
            this.handleError('Failed to pause recording', error);
        }
    }

    /**
     * Handles stop button click
     */
    private async handleStop(): Promise<void> {
        try {
            const finalBlob = await this.recordingManager.stop();
            
            let result: Blob | string;
            
            if (this.useStreaming && this.streamingService) {
                // Streaming mode - get transcription result
                new Notice('Finishing transcription...');
                result = await this.streamingService.finishProcessing();
                
                // Cleanup live preview BEFORE inserting final result
                // This prevents duplication
                this.removeLivePreview();
                
                if (!result || result.trim().length === 0) {
                    // If no result, maybe user didn't speak. 
                    // Warning: removeLivePreview already removed the placeholder.
                    // If empty, we just don't insert anything else?
                    // But we should return something if caller expects it.
                    // Let's allow empty string, but standard logic throws error.
                    // Let's just return result even if empty string, 
                    // logic downstream should handle it.
                }
            } else {
                // Legacy mode - return audio blob
                if (!finalBlob) {
                    throw new Error('No audio data received from recorder');
                }
                result = finalBlob;
            }

            // Close recording modal first
            this.cleanup();
            super.close();

            // Always save the recording
            if (this.onStop) {
                await this.onStop(result);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.handleError('Failed to stop recording', error);
        }
    }
    
    // ... (startTimer, updateTimerDisplay, pauseTimer, resumeTimer, cleanup, handleError remain same) ...

    private startTimer(): void {
        this.seconds = 0;
        this.updateTimerDisplay();
        
        this.intervalId = window.setInterval(() => {
            this.seconds++;
            this.updateTimerDisplay();

            if (this.seconds >= this.CONFIG.maxDuration) {
                void this.handleStop();
                new Notice('Maximum recording duration reached');
            }
        }, this.CONFIG.updateInterval);
    }

    private updateTimerDisplay(): void {
        this.ui.updateTimer(
            this.seconds,
            this.CONFIG.maxDuration,
            this.CONFIG.warningThreshold
        );
    }

    private pauseTimer(): void {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private resumeTimer(): void {
        if (!this.intervalId) {
            this.intervalId = window.setInterval(() => {
                this.seconds++;
                this.updateTimerDisplay();
            }, this.CONFIG.updateInterval);
        }
    }

    private cleanup(): void {
        try {
            this.pauseTimer();
            this.recordingManager.cleanup();
            this.ui?.cleanup();
            
            // Clean up streaming service
            if (this.streamingService) {
                this.streamingService.abort();
                this.streamingService = null;
            }
            
            // Clean up editor ref if not done
            this.editor = null;
        } catch (error) {
        } finally {
            // Reset states
            this.currentState = 'inactive';
            this.seconds = 0;
            this.isClosing = false;
            this.chunkIndex = 0;
            this.recordingStartTime = 0;
        }
    }

    private handleError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        new Notice(`${message}: ${errorMessage}`);
        this.cleanup();
        void this.requestClose();
    }
}
