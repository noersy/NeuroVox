import { pipeline, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { logger } from './utils/logger';
import { config } from './config';
import { AutoProcessor, AutoModelForSpeechSeq2Seq } from '@xenova/transformers';

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

let whisperPipeline: AutomaticSpeechRecognitionPipeline | any | null = null;
let isV2Model = false;

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
            isV2Model = false;
        } catch (v3Error) {
            logger.warn('Failed to load model with v3, trying v2 compatibility fallback...');
            logger.warn(v3Error);
            
            // Fallback for v2-compatible models
            const processor = await AutoProcessor.from_pretrained(config.modelName, {
                cache_dir: config.modelCacheDir,
            });
            const model = await AutoModelForSpeechSeq2Seq.from_pretrained(config.modelName, {
                cache_dir: config.modelCacheDir,
            });
            
            whisperPipeline = { model, processor };
            isV2Model = true;
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

async function transcribeV2(audioData: Float32Array, language?: string): Promise<string> {
    const { model, processor } = whisperPipeline;

    // Process audio data
    const inputFeatures = await processor(audioData, {
        sampling_rate: 16000,
        return_tensors: 'pt'
    });

    // Generate token ids
    const generatedIds = await model.generate(inputFeatures.input_features, {
        max_length: 448,
        language: language && language !== 'auto' ? language : undefined,
    });
    
    // Decode token ids to text
    const transcription = await processor.batch_decode(generatedIds, {
        skip_special_tokens: true
    });

    return transcription[0].trim();
}

export async function transcribe(audioBuffer: Buffer, language?: string): Promise<string> {
    if (!whisperPipeline) {
        throw new Error('Whisper model not initialized');
    }

    try {
        logger.info(`Transcribing audio (${audioBuffer.length} bytes, language: ${language || 'auto'})...`);
        const startTime = Date.now();

        // Decode audio to Float32Array
        const audioData = await decodeAudio(audioBuffer);
        logger.info(`Audio decoded: ${audioData.length} samples`);

        let resultText: string;

        if (isV2Model) {
            resultText = await transcribeV2(audioData, language);
        } else {
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
            resultText = output.text;
        }
        
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
