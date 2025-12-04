# NeuroVox v2.0.0

NeuroVox is an Obsidian plugin that enhances your note-taking with **local voice transcription** using OpenAI's Whisper model. All processing happens on your machine—no cloud APIs, no data sharing, completely private and free.

## ✨ Features

- **🎙️ Voice Recording**: Record audio directly in your notes with a floating button, toolbar icon, or command palette
- **🔒 Private Transcription**: All audio processing happens locally on your machine using Whisper-small
- **💰 Free & Offline**: No API keys, no subscription costs, works without internet
- **📝 Smart Embedding**: Transcriptions are embedded as callouts wherever your cursor is
- **🎵 Audio Playback**: Audio files are saved and linked in your notes for reference
- **🖥️ Desktop Only**: Optimized for desktop Obsidian (Windows, macOS, Linux)

## 🏗️ Architecture

NeuroVox v2.0.0 uses a **local backend server** architecture:

```
Obsidian Plugin ──HTTP──> Node.js Backend ──> Whisper Model
                           (localhost:3847)     (~244MB)
```

- **Plugin**: Handles recording and UI within Obsidian
- **Backend**: Runs Whisper-small model using Transformers.js
- **Communication**: REST API over localhost (never leaves your machine)

## 📦 Installation

### 1. Install the Plugin

**From Obsidian Community Plugins:**
1. Open Obsidian Settings → Community Plugins
2. Search for "NeuroVox"
3. Click Install, then Enable

**Manual Installation:**
1. Download the latest release from [GitHub Releases](https://github.com/Synaptic-Labs-AI/NeuroVox/releases)
2. Extract to `<vault>/.obsidian/plugins/neurovox/`
3. Reload Obsidian and enable the plugin

### 2. Set Up the Backend Server

The backend server runs the Whisper transcription model locally.

**Navigate to the backend directory:**
```bash
cd <vault>/.obsidian/plugins/neurovox/backend
```

**Install dependencies:**
```bash
npm install
```

**Start the backend server:**
```bash
npm start
```

**First-time setup:** The Whisper-small model (~244MB) will download automatically on first run. This is a one-time process and cached locally in `backend/models/`.

**Expected output:**
```
[INFO] Starting NeuroVox Backend Server...
[INFO] Loading Whisper model (first run may take a few minutes)...
[INFO] ✓ Whisper model loaded successfully
[INFO] ✓ Server running on http://localhost:3847
```

### 3. Configure the Plugin

1. Open Obsidian Settings → NeuroVox
2. Verify **Backend URL** is set to `http://localhost:3847`
3. Click **Test Connection** to ensure the backend is running
4. Configure your preferred recording settings

## 🎯 Usage

### Starting a Recording

**Option 1: Floating Button**
- Enable in Settings → NeuroVox → Floating Button
- Drag the button anywhere on your screen
- Click to start/stop recording

**Option 2: Toolbar Icon**
- Click the microphone icon in the toolbar

**Option 3: Command Palette**
- Press `Ctrl/Cmd + P`
- Type "NeuroVox: Start Recording"

### Recording Controls

- **🎙️ Red Dot**: Recording in progress
- **⏸️ Pause**: Pause/resume recording
- **🗑️ Delete**: Cancel and discard recording
- **✅ Done**: Stop recording and transcribe

### Output

After recording, NeuroVox will:
1. Save the audio file to your configured folder
2. Send audio to the local backend for transcription
3. Embed the transcription as a callout at your cursor position
4. Link the audio file for playback

**Example output:**
```markdown
> [!transcription]
> ![[recording-2024-03-15-10-30.webm]]
>
> This is the transcribed text from your recording.
```

## ⚙️ Settings

### Backend Configuration
- **Backend URL**: Local server address (default: `http://localhost:3847`)
- **Connection Status**: Shows if backend is reachable

### Recording Settings
- **Audio Quality**: Low (128kbps) / Medium (256kbps) / High (320kbps)
- **Recording Format**: WebM/Opus (best compression)
- **Save Location**: Where to store audio files
- **Transcription Model**: Whisper-small (hardcoded, ~244MB)

### Display Settings
- **Floating Button**: Enable/disable draggable recording button
- **Callout Format**: Customize transcription output format

## 🔧 Troubleshooting

### Backend not connecting

**Error:** "⚠️ Backend not responding. Start the server."

**Solutions:**
1. Ensure backend is running: `cd backend && npm start`
2. Check the backend URL in settings is `http://localhost:3847`
3. Verify port 3847 is not blocked by firewall
4. Check backend logs for errors

### Model fails to download

**Error:** "Failed to load Whisper model"

**Solutions:**
1. Ensure stable internet connection (only needed for initial download)
2. Check available disk space (~500MB needed)
3. Try manually clearing cache: `rm -rf backend/models/` and restart
4. Check backend logs: `backend/logs/backend.log`

### Transcription is slow

**Causes:**
- CPU-intensive processing (normal on first transcription)
- Large audio files (>10 minutes)
- Low-end hardware

**Solutions:**
- Wait for model warm-up (first transcription is slower)
- Split long recordings into shorter segments
- Ensure backend has sufficient CPU resources

### Audio quality issues

**Solutions:**
1. Check microphone permissions in OS settings
2. Increase Audio Quality setting (Medium or High)
3. Test microphone in other applications
4. Try a different microphone device

## 🆚 v2.0.0 Breaking Changes

NeuroVox v2.0.0 is a **complete rewrite** from v1.x:

### What Changed
- ❌ **Removed**: Cloud API support (OpenAI, Groq, Deepgram)
- ❌ **Removed**: Post-processing and LLM features
- ❌ **Removed**: Mobile support
- ✅ **Added**: Local Whisper transcription backend
- ✅ **Added**: Complete privacy (no data leaves your machine)
- ✅ **Added**: Zero API costs

### Migration from v1.x
1. Update to v2.0.0
2. Set up backend server (see Installation above)
3. Old settings (API keys, post-processing) will be automatically removed
4. Recordings folder and audio files are preserved

### Why the Change?
- **Privacy**: Your voice recordings stay on your machine
- **Cost**: No monthly API bills
- **Reliability**: Works offline, no rate limits
- **Simplicity**: No API key management

## 🛠️ Development

### Running Backend in Development

**With VS Code:**
1. Open `backend/` folder in VS Code
2. Press `F5` to start debugging
3. Select "Start Backend Server" configuration

**With CLI:**
```bash
cd backend
npm run dev  # Uses ts-node for hot reload
```

### Building Backend

```bash
cd backend
npm run build  # Compiles TypeScript to dist/
npm start      # Runs compiled JavaScript
```

### Building Plugin

```bash
npm run dev    # Development mode with hot reload
npm run build  # Production build
```

## 📋 System Requirements

- **Obsidian**: v0.15.0 or higher
- **Node.js**: v16+ (for backend)
- **Platform**: Windows, macOS, or Linux (desktop only)
- **RAM**: 2GB+ recommended (for model inference)
- **Disk Space**: 500MB for model and dependencies

## 🤝 Contribution

Contributions are welcome! Please fork the repository, make your changes, and open a pull request.

**Development setup:**
1. Clone the repository
2. Install plugin dependencies: `npm install`
3. Install backend dependencies: `cd backend && npm install`
4. Build plugin: `npm run dev`
5. Build backend: `cd backend && npm run dev`

## 📄 License

MIT License - see LICENSE file for details

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/Synaptic-Labs-AI/NeuroVox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Synaptic-Labs-AI/NeuroVox/discussions)
- **Author**: [Synaptic Labs](https://www.synapticlabs.ai)
- **Funding**: [Support Development](https://donate.stripe.com/bIY4gsgDo2mJ5kkfZ6)

## 🙏 Acknowledgments

- OpenAI Whisper model
- Hugging Face Transformers.js
- Obsidian community

---

**NeuroVox v2.0.0** - Private, Free, Local Voice Transcription for Obsidian
