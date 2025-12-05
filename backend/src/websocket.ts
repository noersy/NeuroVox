import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './utils/logger';
import { transcribeBuffer } from './whisper';

export function initializeWebSocket(server: Server) {
    const wss = new WebSocketServer({ server, path: '/api/live' });

    logger.info('Initializing WebSocket server on /api/live');

    wss.on('connection', (ws: WebSocket) => {
        logger.info('New WebSocket connection established');

        let audioBuffer: Buffer[] = [];
        let transcriptionTimer: NodeJS.Timeout | null = null;
        let isTranscribing = false;
        let lastTranscriptionTime = Date.now();

        ws.on('message', async (message: any, isBinary: boolean) => {
            if (isBinary) {
                // Binary message = Audio Chunk
                audioBuffer.push(message);

                // 1. Silence Detection (Debounce): Transcribe if no new data for 500ms
                if (transcriptionTimer) clearTimeout(transcriptionTimer);
                
                transcriptionTimer = setTimeout(() => {
                    triggerTranscription();
                }, 500);

                // 2. Continuous Transcription (Throttle): Transcribe if buffer gets too large (time-based approximation)
                // If we have been collecting chunks for more than 3 seconds, force a transcription
                // This prevents waiting too long for long sentences.
                // Since we don't know exact duration, we rely on the client sending chunks roughly every 100-500ms.
                // If we assume 10 chunks ~ 1-2 seconds (depending on client slice time), we can check buffer count.
                // But a time-based check since last transcription is better.
                const now = Date.now();
                if (now - lastTranscriptionTime > 3000 && !isTranscribing) {
                     triggerTranscription();
                }
            } else {
                // Text message = Control command
                try {
                    const command = JSON.parse(message.toString());
                    if (command.type === 'reset') {
                        audioBuffer = [];
                        logger.info('Audio buffer cleared by client');
                    } else if (command.type === 'flush') {
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
            audioBuffer = [];
        });

        ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
        });

        async function triggerTranscription() {
            if (audioBuffer.length === 0 || isTranscribing) return;

            isTranscribing = true;
            const combinedBuffer = Buffer.concat(audioBuffer);
            
            try {
                // Clear buffer after taking snapshot? 
                // For continuous speech, we might want to keep context, 
                // but for simple live transcription of phrases, clearing is safer 
                // to avoid processing the same audio over and over.
                // A robust stream would use a sliding window, but let's start with simple chunk-based.
                // The "silence" trigger implies the user stopped speaking.
                audioBuffer = []; 

                const text = await transcribeBuffer(combinedBuffer);
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
