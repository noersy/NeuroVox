import { Notice, TFile, EditorPosition, Editor } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { AudioProcessor } from './audio/AudioProcessor';
import { TranscriptionService } from './transcription/TranscriptionService';
import { DocumentInserter } from './document/DocumentInserter';
import { ProcessingState } from './state/ProcessingState';

/**
 * Configuration for the processing pipeline
 */
interface ProcessingConfig {
    maxRetries: number;
    retryDelay: number;
}

/**
 * Handles the processing of audio recordings by coordinating between specialized modules:
 * - AudioProcessor: Handles audio chunking, concatenation, and file operations
 * - TranscriptionService: Manages AI transcription and post-processing
 * - DocumentInserter: Handles formatting and inserting content into notes
 * - ProcessingState: Manages state persistence and tracking
 */
export class RecordingProcessor {
    private static instance: RecordingProcessor | null = null;
    private readonly processingState: ProcessingState;
    private readonly audioProcessor: AudioProcessor;
    private readonly transcriptionService: TranscriptionService;
    private readonly documentInserter: DocumentInserter;

    private readonly config: ProcessingConfig = {
        maxRetries: 3,
        retryDelay: 1000
    };

    private constructor(private plugin: NeuroVoxPlugin) {
        this.processingState = new ProcessingState();
        this.audioProcessor = new AudioProcessor(plugin);
        this.transcriptionService = new TranscriptionService(plugin);
        this.documentInserter = new DocumentInserter(plugin);
    }

    public static getInstance(plugin: NeuroVoxPlugin): RecordingProcessor {
        return this.instance ??= new RecordingProcessor(plugin);
    }

    /**
     * Processes a recording: transcribes audio and inserts the content into the document
     */
    public async processRecording(
        audioBlob: Blob,
        activeFile: TFile,
        cursorPosition: EditorPosition,
        audioFilePath?: string,
        editor?: Editor
    ): Promise<void> {
        if (this.processingState.getIsProcessing()) {
            throw new Error('Recording is already in progress.');
        }

        try {
            this.processingState.setIsProcessing(true);
            this.processingState.reset();
            
            // Process the audio file
            this.processingState.startStep('Audio Processing');
            const audioResult = await this.audioProcessor.processAudio(audioBlob, audioFilePath);
            this.processingState.completeStep();

            // Update progress if chunks were processed
            if (audioResult.processedChunks && audioResult.totalChunks) {
                this.processingState.updateProgress(
                    audioResult.processedChunks,
                    audioResult.totalChunks
                );
            }

            // Transcribe the audio
            this.processingState.startStep('Transcription');
            const audioBuffer = await audioResult.audioBlob.arrayBuffer();
            const transcription = await this.executeWithRetry(() =>
                this.transcriptionService.transcribeContent(audioBuffer)
            );
            this.processingState.completeStep();

            // Insert the content
            this.processingState.startStep('Content Insertion');
            await this.documentInserter.insertContent(
                transcription,
                audioResult.finalPath,
                activeFile,
                cursorPosition,
                editor
            );
            this.processingState.completeStep();

        } catch (error) {
            this.handleError('Processing failed', error);
            this.processingState.setError(error as Error);
            throw error;
        } finally {
            this.processingState.setIsProcessing(false);
        }
    }

    /**
     * Processes a streaming transcription result: inserts pre-transcribed content into the document
     */
    public async processStreamingResult(
        transcriptionResult: string,
        activeFile: TFile,
        cursorPosition: EditorPosition,
        editor?: Editor
    ): Promise<void> {
        if (this.processingState.getIsProcessing()) {
            throw new Error('Recording is already in progress.');
        }

        try {
            this.processingState.setIsProcessing(true);
            this.processingState.reset();

            // Insert the content
            this.processingState.startStep('Content Insertion');
            await this.documentInserter.insertContent(
                transcriptionResult,
                undefined, // No audioFilePath for streaming mode
                activeFile,
                cursorPosition,
                editor
            );
            this.processingState.completeStep();

        } catch (error) {
            this.handleError('Processing failed', error);
            this.processingState.setError(error as Error);
            throw error;
        } finally {
            this.processingState.setIsProcessing(false);
        }
    }

    /**
     * Executes an operation with retry logic
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        retryCount = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retryCount < this.config.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                return this.executeWithRetry(operation, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Handles error display
     */
    private handleError(context: string, error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        new Notice(`${context}: ${message}`);
    }
}