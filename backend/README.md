# NeuroVox Backend Server

Local Whisper transcription backend for the NeuroVox Obsidian plugin.

## Features

- 🏠 **Local Processing** - All transcription happens on your machine
- 🔒 **Privacy First** - Your audio never leaves your device
- 🚀 **Fast** - Optimized quantized Whisper-small model
- 🆓 **Free** - No API costs, no subscriptions

## Requirements

- Node.js v18 or higher
- ~500MB free disk space (for model cache)
- Internet connection (first run only, to download model)

## Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Start the Server

```bash
npm start
```

The server will:
1. Start on `http://localhost:3847`
2. Download the Whisper-small model (~244MB) on first run
3. Load the model into memory
4. Begin accepting transcription requests

**First Run**: The initial startup takes 2-5 minutes to download the model. Subsequent starts are much faster (10-30 seconds).

### Development Mode

For development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### Health Check

```bash
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "model": "Xenova/whisper-small",
  "modelLoaded": true
}
```

### Transcribe Audio

```bash
POST /api/transcribe
Content-Type: multipart/form-data

Body: audio file (max 100MB)
```

Response:
```json
{
  "transcript": "Your transcribed text here",
  "duration": 1.23
}
```

## Configuration

Edit `src/config.ts` to customize:

- **Port**: Default 3847
- **Model**: Default whisper-small (244MB)
- **Max file size**: Default 100MB
- **CORS origins**: Allowed request origins

## Troubleshooting

### Server won't start

- Check Node.js version: `node --version` (must be v18+)
- Check port 3847 is available: `netstat -an | findstr 3847` (Windows) or `lsof -i :3847` (Mac/Linux)
- Check logs in `logs/` directory

### Model download fails

- Verify internet connection
- Check available disk space (need ~500MB)
- Try manually clearing cache: `rm -rf models/`

### Connection refused from plugin

- Verify server is running: `curl http://localhost:3847/api/health`
- Check firewall settings
- Verify CORS configuration in `src/config.ts`

### Slow transcription

- First transcription is slower as the model warms up
- Consider using a GPU-enabled version (future enhancement)
- Reduce audio quality in plugin settings

## Architecture

```
┌─────────────────┐
│  Obsidian Plugin│
└────────┬────────┘
         │ HTTP POST /api/transcribe
         ↓
┌─────────────────┐
│  Express Server │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Transformers.js │
│ (Whisper-small) │
└─────────────────┘
```

## Performance

Typical transcription times (on modern CPU):

- 1 min audio: ~10-15 seconds
- 5 min audio: ~30-45 seconds
- 10 min audio: ~60-90 seconds

*Times vary based on CPU speed and audio complexity.*

## License

MIT License - See main project README for details.

## Support

For issues and feature requests, visit:
https://github.com/Synaptic-Labs-AI/NeuroVox/issues
