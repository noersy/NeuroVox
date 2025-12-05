import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config';
import { initializeWhisper } from './whisper';
import { initializeWebSocket } from './websocket';
import healthRouter from './routes/health';
import transcribeRouter from './routes/transcribe';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

const app = express();

// Middleware
app.use(cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/transcribe', transcribeRouter);

// Error handling
app.use(errorHandler);

// Initialize and start server
async function start(): Promise<void> {
    try {
        logger.info('========================================');
        logger.info('Starting NeuroVox Backend Server...');
        logger.info('========================================');

        // Initialize Whisper model
        await initializeWhisper();

        // Create HTTP server and attach WebSocket
        const server = createServer(app);
        initializeWebSocket(server);

        // Start server
        server.listen(config.port, () => {
            logger.info('========================================');
            logger.info(`✓ Server running on http://localhost:${config.port}`);
            logger.info(`✓ Health endpoint: http://localhost:${config.port}/api/health`);
            logger.info(`✓ Transcribe endpoint: http://localhost:${config.port}/api/transcribe`);
            logger.info(`✓ Live endpoint: ws://localhost:${config.port}/api/live`);
            logger.info('========================================');
            logger.info('Ready to accept transcription requests!');
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// Start the server
start();