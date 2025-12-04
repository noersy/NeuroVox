import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { transcribe } from '../whisper';
import { logger } from '../utils/logger';
import { config } from '../config';

const router = Router();

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileSize }
});

router.post('/', upload.single('audio'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Get language from request body or query parameter
        const language = req.body.language || req.query.language as string | undefined;

        logger.info(`Received transcription request: ${req.file.originalname} (${req.file.size} bytes, language: ${language || 'auto'})`);

        const startTime = Date.now();
        const transcript = await transcribe(req.file.buffer, language);
        const duration = (Date.now() - startTime) / 1000;

        logger.info(`Transcription completed in ${duration.toFixed(2)}s`);

        res.json({
            transcript,
            duration,
            language: language || 'auto'
        });
    } catch (error) {
        next(error);
    }
});

export default router;
