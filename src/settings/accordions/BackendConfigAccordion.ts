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
    private transcriptionStatusSetting!: Setting;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public plugin: NeuroVoxPlugin
    ) {
        super(
            containerEl,
            "🖥️ Local Backend Configuration",
            "Configure connection to local Whisper backend server and transcription settings."
        );
    }

    setRecordingAccordion(recording: RecordingAccordion): void {
        this.recordingAccordion = recording;
    }

    render(): void {
        // Add section header styling
        const headerDiv = this.contentEl.createEl("div", { cls: "backend-config-header" });
        headerDiv.createEl("h4", { text: "Server Connection", cls: "setting-item-heading" });

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

        // Transcription Status Display
        this.transcriptionStatusSetting = new Setting(this.contentEl)
            .setName("Transcription Status")
            .setDesc(this.getTranscriptionStatusDesc());

        // Add divider
        this.contentEl.createEl("div", { cls: "setting-item-divider" });

        // Transcription Settings Section
        const transHeaderDiv = this.contentEl.createEl("div", { cls: "backend-config-header" });
        transHeaderDiv.createEl("h4", { text: "Transcription Settings", cls: "setting-item-heading" });

        // Language Selection
        new Setting(this.contentEl)
            .setName("Language")
            .setDesc("Select the language for transcription. 'Auto' will detect the language automatically.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption("auto", "🌐 Auto Detect")
                    .addOption("en", "🇺🇸 English")
                    .addOption("id", "🇮🇩 Indonesian / Bahasa Indonesia")
                    .addOption("es", "🇪🇸 Spanish / Español")
                    .addOption("fr", "🇫🇷 French / Français")
                    .addOption("de", "🇩🇪 German / Deutsch")
                    .addOption("ja", "🇯🇵 Japanese / 日本語")
                    .addOption("zh", "🇨🇳 Chinese / 中文")
                    .addOption("ko", "🇰🇷 Korean / 한국어")
                    .addOption("pt", "🇧🇷 Portuguese / Português")
                    .addOption("ru", "🇷🇺 Russian / Русский")
                    .addOption("ar", "🇸🇦 Arabic / العربية")
                    .addOption("hi", "🇮🇳 Hindi / हिन्दी")
                    .addOption("it", "🇮🇹 Italian / Italiano")
                    .addOption("nl", "🇳🇱 Dutch / Nederlands")
                    .addOption("pl", "🇵🇱 Polish / Polski")
                    .addOption("tr", "🇹🇷 Turkish / Türkçe")
                    .addOption("vi", "🇻🇳 Vietnamese / Tiếng Việt")
                    .addOption("th", "🇹🇭 Thai / ไทย")
                    .setValue(this.settings.transcriptionLanguage)
                    .onChange(async (value: string) => {
                        this.settings.transcriptionLanguage = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Auto-check connection on render
        this.checkConnectionStatus();

        // Listen for transcription status changes
        window.addEventListener('neurovox:transcription-status-changed', this.handleTranscriptionStatusChange.bind(this));
    }

    private handleTranscriptionStatusChange = (): void => {
        this.updateTranscriptionStatus();
    };

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

    public updateTranscriptionStatus(): void {
        if (this.transcriptionStatusSetting) {
            this.transcriptionStatusSetting.setDesc(this.getTranscriptionStatusDesc());
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

    private getTranscriptionStatusDesc(): string {
        if (this.settings.isTranscribing) {
            return "⏳ Processing - Transcribing audio... Please wait.";
        } else {
            return "✅ Ready - Waiting for audio to transcribe";
        }
    }
}
