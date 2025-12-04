import { requestUrl } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';

export enum AIProvider {
    LocalWhisper = 'local-whisper',
}

export interface AIModel {
    id: string;
    name: string;
    category: 'transcription';
}

export const AIModels: Record<AIProvider, AIModel[]> = {
    [AIProvider.LocalWhisper]: [
        { id: 'whisper-small', name: 'Whisper Small (Local)', category: 'transcription' },
    ],
};

export abstract class AIAdapter {
    public models: AIModel[];

    protected constructor(
        protected settings: NeuroVoxSettings,
        protected provider: AIProvider
    ) {
        this.models = AIModels[provider];
    }

    // Abstract methods for transcription
    protected abstract getTranscriptionEndpoint(): string;
    protected abstract parseTranscriptionResponse(response: any): string;
    public abstract checkBackendHealth(): Promise<boolean>;

    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        try {
            const { headers, body } = await this.prepareTranscriptionRequest(audioArrayBuffer, model);
            const endpoint = this.getTranscriptionEndpoint();

            const response = await requestUrl({
                url: endpoint,
                method: 'POST',
                headers,
                body,
                throw: false
            });

            if (response.status !== 200) {
                throw new Error(`Transcription failed: ${response.status} ${response.text || 'Unknown error'}`);
            }

            return this.parseTranscriptionResponse(response.json);
        } catch (error) {
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to transcribe audio: ${message}`);
        }
    }

    public getAvailableModels(category: 'transcription'): AIModel[] {
        return this.models.filter(model => model.category === category);
    }

    protected async prepareTranscriptionRequest(audioArrayBuffer: ArrayBuffer, model: string): Promise<{
        headers: Record<string, string>;
        body: ArrayBuffer;
    }> {
        // Simple boundary without special characters
        const boundary = 'boundary';
        const encoder = new TextEncoder();
        
        const parts: Uint8Array[] = [];
        
        // File part (keep it simple, just file and filename)
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n\r\n'));
        parts.push(new Uint8Array(audioArrayBuffer));
        parts.push(encoder.encode('\r\n'));
        
        // Model part (just the model name)
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="model"\r\n\r\n'));
        parts.push(encoder.encode(model));
        parts.push(encoder.encode('\r\n'));
        
        // Final boundary
        parts.push(encoder.encode(`--${boundary}--\r\n`));
        
        // Combine all parts
        const totalLength = parts.reduce((acc, part) => acc + part.length, 0);
        const finalBuffer = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const part of parts) {
            finalBuffer.set(part, offset);
            offset += part.length;
        }

        return {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: finalBuffer.buffer
        };
    }

    protected getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        return 'Unknown error occurred';
    }
}
