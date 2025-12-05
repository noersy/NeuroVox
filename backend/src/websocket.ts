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

        ws.on('message', async (message: any, isBinary: boolean) => {
            if (isBinary) {
                // Binary message = Audio Chunk
                audioBuffer.push(message);

                // Debounce: Transcribe if no new data for 500ms
                if (transcriptionTimer) clearTimeout(transcriptionTimer);
                
                transcriptionTimer = setTimeout(() => {
                    triggerTranscription();
                }, 500);
            } else {
                // Text message = Control command
                try {
                    const command = JSON.parse(message.toString());
                    if (command.type === 'reset') {
                        audioBuffer = [];
                        logger.info('Audio buffer cleared by client');
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
            }
        }
    });
}
