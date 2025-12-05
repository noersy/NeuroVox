# NeuroVox Project Context

## Project Overview
**NeuroVox** is an Obsidian plugin that provides private, offline voice transcription. It replaces cloud-based APIs (like OpenAI) with a local Node.js server running a quantized Whisper model. This ensures complete privacy and zero cost for the user.

## 🏗️ Architecture

NeuroVox v2.0.0 uses a **local backend server** architecture:

```
Obsidian Plugin ──HTTP/WS──> Node.js Backend ──> Whisper Model
                             (localhost:3847)     (~244MB)
```

- **Plugin**: Handles recording and UI within Obsidian
- **Backend**: Runs Whisper-small model using Transformers.js
- **Communication**: 
    - REST API (`/api/transcribe`) for file-based transcription
    - WebSocket (`/api/live`) for live streaming transcription

## Key Directories & Files

### Root (Plugin)
- **`src/main.ts`**: Plugin entry point. Handles initialization, UI registration, and backend health checks.
- **`src/adapters/LocalWhisperAdapter.ts`**: Client-side logic for communicating with the backend API.
- **`src/utils/RecordingProcessor.ts`**: Handles the recording lifecycle (start, stop, save, transcribe).
- **`esbuild.config.mjs`**: Build configuration for the plugin.
- **`manifest.json`**: Obsidian plugin metadata.

### Backend (`/backend`)
- **`src/server.ts`**: Express server entry point.
- **`src/whisper.ts`**: Core transcription logic using Hugging Face Transformers.
- **`models/`**: Directory where the Whisper model weights are downloaded and cached (on first run).

## Development Workflow

To work on NeuroVox, you need two terminal instances running.

### 1. Start the Backend Server
The backend does the heavy lifting. It must be running for transcription to work.

```bash
cd backend
npm install     # Install dependencies (first time)
npm run dev     # Start server in watch mode
```
*   **Port:** Defaults to `3847`.
*   **First Run:** Will download the Whisper model (~244MB). This may take a few minutes.

### 2. Build/Watch the Plugin
This compiles the TypeScript plugin code into `main.js` within the project folder.

```bash
# From the root directory
npm install     # Install dependencies (first time)
npm run dev     # Watch mode: rebuilds on file changes
```
*   **Output:** Generates `main.js` and `styles.css`.
*   **Obsidian:** You must reload the Obsidian plugin (or the app) to see changes after a rebuild.

## Build Scripts

| Context | Command | Description |
| :--- | :--- | :--- |
| **Root** | `npm run dev` | Builds plugin in watch mode (development). |
| **Root** | `npm run build` | Production build of the plugin. |
| **Root** | `npm version` | Bumps version in `package.json` and `manifest.json`. |
| **Backend** | `npm run dev` | Runs backend with `ts-node` (hot reload). |
| **Backend** | `npm start` | Runs compiled backend (production). |

## Coding Conventions
- **TypeScript:** Both the plugin and backend use strict TypeScript.
- **Async/Await:** heavily used for file I/O and API calls.
- **Error Handling:**
    - **Plugin:** Uses `Notice` to inform the user of errors (e.g., "Backend offline").
    - **Backend:** Uses standard HTTP error codes (500 for transcoding/inference failures).
- **Settings:** Plugin settings are defined in `src/settings/Settings.ts` and persisted in `data.json` (managed by Obsidian).

## Common Tasks
- **Changing the Model:** The backend currently hardcodes `whisper-small`. To change this, edit `backend/src/config.ts` (or `whisper.ts`) and the plugin's expected behavior if necessary.
- **UI Updates:** Modifications to the floating button or sidebar go in `src/ui/`.
- **Debugging:**
    - **Plugin:** Use the Obsidian Developer Console (`Ctrl+Shift+I`).
    - **Backend:** Check the terminal output where `npm run dev` is running.
