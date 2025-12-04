import { requestUrl } from 'obsidian';
import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';

export class LocalWhisperAdapter extends AIAdapter {
    private backendUrl: string;

    constructor(settings: NeuroVoxSettings, backendUrl: string) {
        super(settings, AIProvider.LocalWhisper);
        this.backendUrl = backendUrl;
    }

    protected getTranscriptionEndpoint(): string {
        return `${this.backendUrl}/api/transcribe`;
    }

    protected parseTranscriptionResponse(response: any): string {
        if (!response || typeof response.transcript !== 'string') {
            throw new Error('Invalid response format from backend');
        }
        return response.transcript;
    }

    public async checkBackendHealth(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: `${this.backendUrl}/api/health`,
                method: 'GET',
                throw: false
            });

            if (response.status !== 200) {
                return false;
            }

            const data = response.json;
            return data.status === 'ok' && data.modelLoaded === true;
        } catch (error) {
            return false;
        }
    }

    protected async prepareTranscriptionRequest(audioArrayBuffer: ArrayBuffer, model: string): Promise<{
        headers: Record<string, string>;
        body: ArrayBuffer;
    }> {
        // Prepare multipart/form-data request
        const boundary = 'boundary';
        const encoder = new TextEncoder();

        const parts: Uint8Array[] = [];

        // Audio file part
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="audio"; filename="audio.wav"\r\n'));
        parts.push(encoder.encode('Content-Type: audio/wav\r\n\r\n'));
        parts.push(new Uint8Array(audioArrayBuffer));
        parts.push(encoder.encode('\r\n'));

        // End boundary
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

    public getBackendUrl(): string {
        return this.backendUrl;
    }

    public setBackendUrl(url: string): void {
        this.backendUrl = url;
    }
}
