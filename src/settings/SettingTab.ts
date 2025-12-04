// src/settings/SettingTab.ts

import { App, PluginSettingTab } from 'obsidian';
import { BackendConfigAccordion } from './accordions/BackendConfigAccordion';
import { RecordingAccordion } from './accordions/RecordingAccordion';
import { AIProvider } from '../adapters/AIAdapter';
import NeuroVoxPlugin from '../main';

export class NeuroVoxSettingTab extends PluginSettingTab {
    plugin: NeuroVoxPlugin;
    private recordingAccordion: RecordingAccordion | null = null;
    public backendAccordion: BackendConfigAccordion | null = null;

    constructor(app: App, plugin: NeuroVoxPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Create containers in display order
        const backendConfigContainer = containerEl.createDiv();
        const recordingContainer = containerEl.createDiv();

        // Create Recording accordion first
        this.recordingAccordion = new RecordingAccordion(
            recordingContainer,
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin
        );

        // Create BackendConfig accordion and store reference
        this.backendAccordion = new BackendConfigAccordion(
            backendConfigContainer,
            this.plugin.settings,
            this.plugin
        );

        // Link the accordions
        this.backendAccordion.setRecordingAccordion(this.recordingAccordion);

        // Render all accordions in order
        this.backendAccordion.render();
        this.recordingAccordion.render();
    }

    getRecordingAccordion(): RecordingAccordion | null {
        return this.recordingAccordion;
    }
}
