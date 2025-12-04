import { pipeline, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { logger } from './utils/logger';
import { config } from './config';

let whisperPipeline: AutomaticSpeechRecognitionPipeline | null = null;

export async function initializeWhisper(): Promise<void> {
    try {
        logger.info(`Loading Whisper model: ${config.modelName}...`);
        logger.info('This may take a few minutes on first run (downloading ~244MB model)');

        whisperPipeline = await pipeline(
            'automatic-speech-recognition',
            config.modelName,
            {
                cache_dir: config.modelCacheDir,
                quantized: true // Use quantized model for faster inference
            }
        );

        logger.info('Whisper model loaded successfully');
    } catch (error) {
        logger.error('Failed to load Whisper model:', error);
        throw error;
    }
}

export async function transcribe(audioBuffer: Buffer): Promise<string> {
    if (!whisperPipeline) {
        throw new Error('Whisper model not initialized');
    }

    try {
        logger.info(`Transcribing audio (${audioBuffer.length} bytes)...`);
        const startTime = Date.now();

        const result = await whisperPipeline(audioBuffer);

        const duration = (Date.now() - startTime) / 1000;
        logger.info(`Transcription completed in ${duration.toFixed(2)}s`);

        return result.text;
    } catch (error) {
        logger.error('Transcription failed:', error);
        throw error;
    }
}

export function isModelLoaded(): boolean {
    return whisperPipeline !== null;
}
