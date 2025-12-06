import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './utils/logger';
import { transcribeFloat32 } from './whisper';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { PassThrough } from 'stream';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

export function initializeWebSocket(server: Server) {
    const wss = new WebSocketServer({ server, path: '/api/live' });

    logger.info('Initializing WebSocket server on /api/live');

    wss.on('connection', (ws: WebSocket) => {
        logger.info('New WebSocket connection established');

        let pcmBuffer: Buffer[] = [];
        let transcriptionTimer: NodeJS.Timeout | null = null;
        let isTranscribing = false;
        let lastTranscriptionTime = Date.now();

        // FFmpeg related variables
        let inputStream: PassThrough | null = null;
        let command: ffmpeg.FfmpegCommand | null = null;

        function startFfmpeg() {
            if (command) return; // Already running

            logger.info('Starting FFmpeg process for streaming...');
            inputStream = new PassThrough();

            // Setup ffmpeg command for streaming decode
            command = ffmpeg(inputStream)
                .inputFormat('webm') // Let ffmpeg probe format
                .format('s16le')
                .audioChannels(1)
                .audioFrequency(16000)
                .on('error', (err: any) => {
                    // Ignore "Output stream closed" error which happens on destroy
                    // Also ignore SIGKILL as we intentionally kill the process on connection close
                    if (err.message && !err.message.includes('Output stream closed') && !err.message.includes('SIGKILL')) {
                        logger.error('FFmpeg streaming error:', err);
                    }
                });

            const ffStream = command.pipe();

            ffStream.on('data', (chunk: Buffer) => {
                logger.info(`FFmpeg output chunk: ${chunk.length} bytes`);
                pcmBuffer.push(chunk);
            });
        }

        ws.on('message', async (message: any, isBinary: boolean) => {
            if (isBinary) {
                logger.info(`Received audio chunk from client: ${message.length} bytes`);

                // Ensure ffmpeg is running
                if (!command) {
                    startFfmpeg();
                }

                // Feed the chunk to ffmpeg via the stream
                if (inputStream) {
                    try {
                        inputStream.write(message);
                    } catch (e) {
                        logger.warn('Failed to write to ffmpeg stream', e);
                    }
                }

                // 1. Silence Detection (Debounce): Transcribe if no new data for 500ms
                if (transcriptionTimer) clearTimeout(transcriptionTimer);
                
                transcriptionTimer = setTimeout(() => {
                    logger.debug('Silence detected, triggering transcription');
                    triggerTranscription();
                }, 500);

                // 2. Continuous Transcription (Throttle): Transcribe if buffer gets too large
                const now = Date.now();
                if (now - lastTranscriptionTime > 3000 && !isTranscribing) {
                     logger.debug('Time threshold reached, triggering transcription');
                     triggerTranscription();
                }
            } else {
                // Text message = Control command
                try {
                    const commandData = JSON.parse(message.toString());
                    if (commandData.type === 'reset') {
                        pcmBuffer = [];
                        logger.info('Audio buffer cleared by client');
                    } else if (commandData.type === 'flush') {
                        logger.info('Flush requested by client');
                        triggerTranscription();
                    }
                } catch (e) {
                    logger.warn('Received invalid JSON text message');
                }
            }
        });

        ws.on('close', () => {
            logger.info('WebSocket connection closed');
            if (transcriptionTimer) clearTimeout(transcriptionTimer);
            
            // Clean up ffmpeg
            try {
                if (inputStream) inputStream.end();
                if (command) {
                    command.kill('SIGKILL');
                }
            } catch (e) {
                logger.error('Error cleaning up ffmpeg:', e);
            }
            pcmBuffer = [];
            command = null;
            inputStream = null;
        });

        ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
        });

        async function triggerTranscription() {
            if (pcmBuffer.length === 0) {
                logger.debug('No PCM data to transcribe');
                return;
            }
            if (isTranscribing) {
                logger.debug('Transcription already in progress, skipping');
                return;
            }

            isTranscribing = true;
            
            // Combine accumulated PCM chunks
            const combinedPCM = Buffer.concat(pcmBuffer);
            logger.info(`Transcribing ${combinedPCM.length} bytes of PCM data`);
            
            // Clear buffer immediately to capture new speech separately
            // (Or we could implement sliding window here for better context)
            pcmBuffer = []; 

            try {
                // Convert s16le buffer to Float32Array
                // combinedPCM is 16-bit little-endian
                const samples = new Int16Array(
                    combinedPCM.buffer, 
                    combinedPCM.byteOffset, 
                    combinedPCM.length / 2
                );
                
                const float32Data = new Float32Array(samples.length);
                for (let i = 0; i < samples.length; i++) {
                    float32Data[i] = samples[i] / 32768.0;
                }

                // Transcribe
                logger.debug(`Sending ${float32Data.length} samples to Whisper model`);
                const text = await transcribeFloat32(float32Data);
                logger.info(`Transcription result: "${text}"`);

                if (text && text.trim()) {
                    ws.send(JSON.stringify({ type: 'transcription', text: text.trim() }));
                }
            } catch (error) {
                logger.error('Live transcription error:', error);
                ws.send(JSON.stringify({ type: 'error', message: 'Transcription failed' }));
            } finally {
                isTranscribing = false;
                lastTranscriptionTime = Date.now();
            }
        }
    });
}