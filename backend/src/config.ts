export const config = {
    port: process.env.PORT || 3847,
    modelName: 'Xenova/whisper-small',
    // modelName: 'Xenova/whisper-medium',
    // modelName: 'Xenova/whisper-tiny',
    // modelName: 'cmaree/Bagus-whisper-small-id-onnx',
    // modelName: 'noery/whisper-small-id-cv17-ONNX',
    // modelName: 'noery/output-tiny-id-ONNX',
    modelCacheDir: './models',
    maxFileSize: 100 * 1024 * 1024, // 100MB
    corsOrigins: [
        'app://obsidian.md',
        'capacitor://localhost',
        'http://localhost'
    ]
};
