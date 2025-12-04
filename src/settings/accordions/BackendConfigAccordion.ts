// src/settings/accordions/BackendConfigAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting } from "obsidian";
import { AIProvider } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";
import { RecordingAccordion } from "./RecordingAccordion";
import { LocalWhisperAdapter } from "../../adapters/LocalWhisperAdapter";

export class BackendConfigAccordion extends BaseAccordion {
    private recordingAccordion!: RecordingAccordion;
    private connectionStatusSetting!: Setting;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public plugin: NeuroVoxPlugin
    ) {
        super(
            containerEl,
            "🖥️ Local Backend",
            "Configure connection to local Whisper backend server."
        );
    }

    setRecordingAccordion(recording: RecordingAccordion): void {
        this.recordingAccordion = recording;
    }

    render(): void {
        // Backend URL Setting
        const urlSetting = new Setting(this.contentEl)
            .setName("Backend URL")
            .setDesc("URL of the local Whisper backend server")
            .addText(text => {
                text
                    .setPlaceholder("http://localhost:3847")
                    .setValue(this.settings.backendUrl);
                text.onChange(async (value: string) => {
                    const trimmedValue = value.trim();
                    this.settings.backendUrl = trimmedValue;
                    await this.plugin.saveSettings();

                    // Update adapter with new URL
                    const adapter = this.plugin.aiAdapters.get(AIProvider.LocalWhisper);
                    if (adapter && adapter instanceof LocalWhisperAdapter) {
                        adapter.setBackendUrl(trimmedValue);
                    }

                    // Reset connection status
                    this.settings.backendConnectionStatus = false;
                    this.updateConnectionStatus();
                });
            });

        // Test Connection Button
        new Setting(this.contentEl)
            .setName("Test Connection")
            .setDesc("Check if the backend server is running and ready")
            .addButton(button => {
                button
                    .setButtonText("Test Connection")
                    .onClick(async () => {
                        button.setButtonText("Testing...");
                        button.setDisabled(true);

                        const adapter = this.plugin.aiAdapters.get(AIProvider.LocalWhisper);
                        if (!adapter || !(adapter instanceof LocalWhisperAdapter)) {
                            button.setButtonText("Test Connection");
                            button.setDisabled(false);
                            return;
                        }

                        const isHealthy = await adapter.checkBackendHealth();
                        this.settings.backendConnectionStatus = isHealthy;
                        await this.plugin.saveSettings();

                        this.updateConnectionStatus();

                        button.setButtonText("Test Connection");
                        button.setDisabled(false);

                        if (this.recordingAccordion) {
                            await this.recordingAccordion.refresh();
                        }
                    });
            });

        // Connection Status Display
        this.connectionStatusSetting = new Setting(this.contentEl)
            .setName("Connection Status")
            .setDesc(this.getConnectionStatusDesc());

        // Auto-check connection on render
        this.checkConnectionStatus();
    }

    private async checkConnectionStatus(): Promise<void> {
        const adapter = this.plugin.aiAdapters.get(AIProvider.LocalWhisper);
        if (adapter && adapter instanceof LocalWhisperAdapter) {
            const isHealthy = await adapter.checkBackendHealth();
            this.settings.backendConnectionStatus = isHealthy;
            await this.plugin.saveSettings();
            this.updateConnectionStatus();
        }
    }

    private updateConnectionStatus(): void {
        if (this.connectionStatusSetting) {
            this.connectionStatusSetting.setDesc(this.getConnectionStatusDesc());
        }
    }

    private getConnectionStatusDesc(): string {
        if (this.settings.backendConnectionStatus) {
            return "🟢 Connected - Backend is running and ready";
        } else {
            return "🔴 Disconnected - Backend not responding. Make sure the server is running:\n" +
                   "1. Navigate to: <vault>/.obsidian/plugins/neurovox/backend\n" +
                   "2. Run: npm install (first time only)\n" +
                   "3. Run: npm start";
        }
    }
}
