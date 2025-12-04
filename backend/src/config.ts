export const config = {
    port: process.env.PORT || 3847,
    // modelName: 'Xenova/whisper-small',
    modelName: 'Xenova/whisper-medium',
    modelCacheDir: './models',
    maxFileSize: 100 * 1024 * 1024, // 100MB
    corsOrigins: [
        'app://obsidian.md',
        'capacitor://localhost',
        'http://localhost'
    ]
};
