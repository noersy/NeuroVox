// src/settings/Settings.ts

import { AIProvider } from '../adapters/AIAdapter';

export enum AudioQuality {
    Low = 'low',
    Medium = 'medium',
    High = 'high'
}

export type NeuroVoxSettings = {
    // Backend Configuration
    backendUrl: string;
    backendConnectionStatus: boolean;

    // Recording
    audioQuality: AudioQuality;
    recordingFolderPath: string;
    transcriptFolderPath: string;
    showFloatingButton: boolean;
    useRecordingModal: boolean;
    showToolbarButton: boolean;
    micButtonColor: string;
    transcriptionModel: string;
    transcriptionProvider: AIProvider;
    transcriptionCalloutFormat: string;
    showTimer: boolean;
    autoStopEnabled: boolean;
    autoStopDuration: number;

    // Mobile Optimization
    enableMobileOptimization: boolean;
    streamingMode: boolean;
    adaptiveQuality: boolean;
    maxMemoryUsage: number; // MB
    includeTimestamps: boolean;
};

export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    // Backend Configuration
    backendUrl: 'http://localhost:3847',
    backendConnectionStatus: false,

    // Recording
    audioQuality: AudioQuality.Medium,
    recordingFolderPath: 'Recordings',
    transcriptFolderPath: 'Transcripts',
    showFloatingButton: true,
    useRecordingModal: true,
    showToolbarButton: true,
    micButtonColor: '#4B4B4B',
    transcriptionModel: 'whisper-small',
    transcriptionProvider: AIProvider.LocalWhisper,
    transcriptionCalloutFormat: '>[!info]- Transcription\n>![[{audioPath}]]\n>{transcription}',
    showTimer: true,
    autoStopEnabled: false,
    autoStopDuration: 5,

    // Mobile Optimization
    enableMobileOptimization: true,
    streamingMode: true, // Auto-detected based on device
    adaptiveQuality: true,
    maxMemoryUsage: 200, // MB
    includeTimestamps: false,
};
