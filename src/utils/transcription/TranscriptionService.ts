import { AIProvider } from '../../adapters/AIAdapter';
import NeuroVoxPlugin from '../../main';

/**
 * Handles transcription of audio content using local Whisper backend
 */
export class TranscriptionService {
    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Transcribes audio content using the local Whisper backend
     * @param audioBuffer The audio data to transcribe
     * @returns The transcription text
     */
    public async transcribeContent(audioBuffer: ArrayBuffer): Promise<string> {
        try {
            const adapter = this.plugin.aiAdapters.get(AIProvider.LocalWhisper);

            if (!adapter) {
                throw new Error('Local Whisper adapter not found. Please check your backend configuration.');
            }

            const transcription = await adapter.transcribeAudio(
                audioBuffer,
                this.plugin.settings.transcriptionModel
            );

            return transcription;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Transcription failed: ${message}`);
        }
    }
}
