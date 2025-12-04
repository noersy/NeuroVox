import { Router, Request, Response } from 'express';
import { isModelLoaded } from '../whisper';
import { config } from '../config';

const router = Router();

router.get('/', (req: Request, res: Response) => {
    const modelLoaded = isModelLoaded();

    res.status(modelLoaded ? 200 : 503).json({
        status: modelLoaded ? 'ok' : 'initializing',
        model: config.modelName,
        modelLoaded
    });
});

export default router;
