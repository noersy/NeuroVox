import { pipeline, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { logger } from './utils/logger';
import { config } from './config';

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

let whisperPipeline: AutomaticSpeechRecognitionPipeline | any | null = null;

export async function initializeWhisper(): Promise<void> {
    try {
        logger.info(`Loading Whisper model: ${config.modelName}...`);
        logger.info('This may take a few minutes on first run (downloading model)');

        // Try loading with default (v3)
        try {
            whisperPipeline = await pipeline(
                'automatic-speech-recognition',
                config.modelName,
                {
                    cache_dir: config.modelCacheDir
                }
            );
        } catch (v3Error) {
            logger.warn('Failed to load model with v3...');
            logger.warn(v3Error);
        }

        logger.info('Whisper model loaded successfully');
    } catch (error) {
        logger.error('Failed to load Whisper model:', error);
        throw error;
    }
}

/**
 * Decodes audio file to Float32Array using ffmpeg
 */
async function decodeAudio(audioBuffer: Buffer): Promise<Float32Array> {
    const inputPath = join(tmpdir(), `whisper-input-${Date.now()}.webm`);
    const outputPath = join(tmpdir(), `whisper-output-${Date.now()}.wav`);

    try {
        // Save input audio
        writeFileSync(inputPath, audioBuffer);

        // Convert to WAV PCM (16-bit, mono, 16kHz) using ffmpeg
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('wav')
                .audioChannels(1)
                .audioFrequency(16000)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .save(outputPath);
        });

        // Read WAV file
        const wavBuffer = readFileSync(outputPath);

        // Simple WAV header parser (assuming 16-bit PCM)
        const dataOffset = 44; // Standard WAV header size
        if (wavBuffer.length < dataOffset) {
            throw new Error('Invalid WAV file: header too small.');
        }

        const samples = new Int16Array(
            wavBuffer.buffer,
            wavBuffer.byteOffset + dataOffset,
            (wavBuffer.length - dataOffset) / 2
        );

        // Convert Int16 to Float32 (normalize to -1.0 to 1.0)
        const float32Data = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            float32Data[i] = samples[i] / 32768.0;
        }

        return float32Data;
    } finally {
        // Clean up temp files
        try {
            unlinkSync(inputPath);
        } catch (e) {
            /* ignore */
        }
        try {
            unlinkSync(outputPath);
        } catch (e) {
            /* ignore */
        }
    }
}

export async function transcribe(audioBuffer: Buffer, language?: string): Promise<string> {
    // if (!whisperPipeline || !whisperPipelinev2) {
    //     throw new Error('Whisper model not initialized');
    // }

    try {
        logger.info(`Transcribing audio (${audioBuffer.length} bytes, language: ${language || 'auto'})...`);
        const startTime = Date.now();

        // Decode audio to Float32Array
        const audioData = await decodeAudio(audioBuffer);
        logger.info(`Audio decoded: ${audioData.length} samples`);


        // Prepare transcription options
        const options: any = {
            return_timestamps: false
        };

        // Add language if specified and not 'auto'
        if (language && language !== 'auto') {
            options.language = language;
        }

        // Transcribe the decoded audio with language option
        const result = await whisperPipeline(audioData, options);

        // Handle both single result and array results
        const output = Array.isArray(result) ? result[0] : result;
        const resultText = output.text;

        const duration = (Date.now() - startTime) / 1000;
        logger.info(`Transcription completed in ${duration.toFixed(2)}s`);

        return resultText;
    } catch (error) {
        logger.error('Transcription failed:', error);
        throw error;
    }
}

export function isModelLoaded(): boolean {
    return whisperPipeline !== null;
}
