import { pipeline, AutomaticSpeechRecognitionPipeline, read_audio } from '@huggingface/transformers';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
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
                cache_dir: config.modelCacheDir
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

    let tempFilePath: string | null = null;

    try {
        logger.info(`Transcribing audio (${audioBuffer.length} bytes)...`);
        const startTime = Date.now();

        // Save buffer to temporary file
        tempFilePath = join(tmpdir(), `whisper-temp-${Date.now()}.webm`);
        writeFileSync(tempFilePath, audioBuffer);

        // Decode audio file to raw PCM data
        const audioData = await read_audio(tempFilePath, 16000); // 16kHz sampling rate for Whisper

        // Transcribe the decoded audio
        const result = await whisperPipeline(audioData);

        const duration = (Date.now() - startTime) / 1000;
        logger.info(`Transcription completed in ${duration.toFixed(2)}s`);

        // Handle both single result and array results
        const output = Array.isArray(result) ? result[0] : result;
        return output.text;
    } catch (error) {
        logger.error('Transcription failed:', error);
        throw error;
    } finally {
        // Clean up temporary file
        if (tempFilePath) {
            try {
                unlinkSync(tempFilePath);
            } catch (cleanupError) {
                logger.warn(`Failed to clean up temp file: ${tempFilePath}`, cleanupError);
            }
        }
    }
}

export function isModelLoaded(): boolean {
    return whisperPipeline !== null;
}
