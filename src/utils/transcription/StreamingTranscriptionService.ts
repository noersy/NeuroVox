import { ChunkMetadata, TranscriptionChunk, StreamingCallbacks } from '../../types';
import { ChunkQueue } from '../audio/ChunkQueue';
import { ResultCompiler } from './ResultCompiler';
import { DeviceDetection } from '../DeviceDetection';
import NeuroVoxPlugin from '../../main';
import { Notice } from 'obsidian';

export class StreamingTranscriptionService {
    private chunkQueue: ChunkQueue;
    private resultCompiler: ResultCompiler;
    private plugin: NeuroVoxPlugin;
    private isProcessing: boolean = false;
    private processedChunks: Set<string> = new Set();
    private callbacks: StreamingCallbacks;
    
    private socket: WebSocket | null = null;
    private socketUrl: string;
    private isSocketOpen: boolean = false;
    private deviceDetection: DeviceDetection;

    constructor(
        plugin: NeuroVoxPlugin,
        callbacks?: StreamingCallbacks
    ) {
        this.plugin = plugin;
        this.deviceDetection = DeviceDetection.getInstance();
        const options = this.deviceDetection.getOptimalStreamingOptions();
        
        this.chunkQueue = new ChunkQueue(
            options.maxQueueSize,
            options.memoryLimit,
            callbacks?.onMemoryWarning
        );
        
        this.resultCompiler = new ResultCompiler();
        this.callbacks = callbacks || {};

        // Construct WebSocket URL
        const backendUrl = this.plugin.settings.backendUrl || 'http://localhost:3847';
        // Simple replacement of protocol
        const wsUrl = backendUrl.replace(/^http/, 'ws');
        this.socketUrl = `${wsUrl}/api/live`;
    }

    async addChunk(chunk: Blob, metadata: ChunkMetadata): Promise<boolean> {
        // Try to add to queue
        const added = await this.chunkQueue.enqueue(chunk, metadata);
        
        if (!added) {
            return false;
        }

        // Start processing if not already running
        if (!this.isProcessing) {
            this.startProcessing();
        }

        return true;
    }

    public async start(): Promise<void> {
        await this.startProcessing();
    }

    private async startProcessing(): Promise<void> {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        
        try {
            await this.connectSocket();
            this.processQueueLoop();
        } catch (error) {
            console.error('Failed to connect to streaming server:', error);
            new Notice('⚠️ Connection to streaming backend failed');
            this.isProcessing = false;
        }
    }

    private connectSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            try {
                this.socket = new WebSocket(this.socketUrl);

                this.socket.onopen = () => {
                    this.isSocketOpen = true;
                    resolve();
                };

                this.socket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    if (!this.isSocketOpen) reject(error);
                };

                this.socket.onclose = () => {
                    this.isSocketOpen = false;
                    // If closed unexpectedly during processing, we might want to handle it
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    private handleMessage(data: any) {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'transcription') {
                this.handleTranscriptionResult(message.text);
            } else if (message.type === 'error') {
                console.warn('Streaming backend reported error:', message.message);
            }
        } catch (e) {
            console.warn('Received invalid message from streaming backend');
        }
    }

    private handleTranscriptionResult(text: string) {
        if (!text) return;

        // Create a synthetic chunk for the result
        // We use the current time as a proxy for the timestamp since backend doesn't provide it
        const chunk: TranscriptionChunk = {
            metadata: {
                id: `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                index: this.processedChunks.size,
                duration: 0, // Unknown duration for this specific segment
                timestamp: Date.now(),
                size: 0
            },
            transcript: text,
            processed: true
        };

        this.resultCompiler.addSegment(chunk);
        
        // Notify partial result update
        // We calculate progress based on queue
        if (this.callbacks.onProgress) {
            const total = this.processedChunks.size + this.chunkQueue.size();
            this.callbacks.onProgress(this.processedChunks.size, total);
        }

        // Notify transcription update
        if (this.callbacks.onTranscriptionUpdate) {
            this.callbacks.onTranscriptionUpdate(this.getPartialResult());
        }
    }

    private async processQueueLoop() {
        while (this.isProcessing && this.isSocketOpen) {
            const item = this.chunkQueue.dequeue();
            
            if (!item) {
                // No chunks available, wait a bit
                await this.sleep(50);
                continue;
            }

            try {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    const buffer = await item.chunk.arrayBuffer();
                    this.socket.send(buffer);
                    
                    this.processedChunks.add(item.metadata.id);
                    this.cleanupBlob(item.chunk);
                } else {
                    // Socket closed? Put it back? 
                    // For now, just break logic or try reconnect
                    console.warn('Socket closed while processing queue');
                    break;
                }
            } catch (error) {
                console.error('Error processing chunk:', error);
            }
        }
    }

    async finishProcessing(): Promise<string> {
        // Stop accepting new processing loops
        this.isProcessing = false;

        // Wait for queue to empty
        let attempts = 0;
        while (this.chunkQueue.size() > 0 && attempts < 100) { // Wait up to 5s
            await this.sleep(50);
            attempts++;
        }

        // Send flush command
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify({ type: 'flush' }));
                // Wait a bit for the flush result to come back
                await this.sleep(1000);
            } catch (e) {
                console.error('Failed to flush stream:', e);
            }
            
            this.socket.close();
        }

        // Get final result
        return this.resultCompiler.getFinalResult(
            this.plugin.settings.includeTimestamps || false,
            true // Include metadata
        );
    }

    getPartialResult(): string {
        return this.resultCompiler.getPartialResult(
            this.plugin.settings.includeTimestamps || false
        );
    }

    getStats() {
        return {
            queueStats: this.chunkQueue.getStats(),
            processedChunks: this.processedChunks.size,
            totalDuration: this.resultCompiler.getTotalDuration(),
            segmentCount: this.resultCompiler.getSegmentCount()
        };
    }

    abort(): void {
        this.isProcessing = false;
        this.chunkQueue.clear();
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.cleanup();
    }

    private cleanup(): void {
        this.chunkQueue.clear();
        this.resultCompiler.clear();
        this.processedChunks.clear();
        this.isProcessing = false;
    }

    private cleanupBlob(blob: Blob): void {
        try {
            if (blob && typeof URL.revokeObjectURL === 'function') {
                URL.revokeObjectURL(blob as any);
            }
        } catch (e) {
            // Ignore errors
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isQueuePaused(): boolean {
        return this.chunkQueue.isPaused();
    }

    getMemoryUsage(): number {
        return this.chunkQueue.getMemoryUsage();
    }
}
