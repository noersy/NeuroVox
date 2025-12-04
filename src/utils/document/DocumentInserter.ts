import { EditorPosition, Notice, TFile } from 'obsidian';
import NeuroVoxPlugin from '../../main';

/**
 * Handles formatting and insertion of transcription content into notes
 */
export class DocumentInserter {
    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Inserts formatted transcription content at the specified position in a file
     * @param transcription The transcribed text
     * @param audioFilePath Optional path to the audio file
     * @param file The target file
     * @param position The cursor position for insertion
     */
    public async insertContent(
        transcription: string,
        audioFilePath: string | undefined,
        file: TFile,
        position: EditorPosition
    ): Promise<void> {
        try {
            const formattedContent = this.formatContent(transcription, audioFilePath);
            await this.insertAtPosition(formattedContent, file, position);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            new Notice(`Content insertion failed: ${message}`);
            throw error;
        }
    }

    /**
     * Checks if a format string uses Obsidian callout syntax
     */
    private isCalloutFormat(format: string): boolean {
        return format.includes('>[!');
    }

    /**
     * Formats lines based on whether callout syntax is being used
     * Ensures we don't double up on '>' characters
     */
    private formatLines(content: string, useCallout: boolean): string {
        return content.split('\n')
            .map(line => {
                if (!useCallout) return line;
                if (!line.trim()) return '>'; // Empty lines just get a single '>'
                // If line already starts with '>', return as is, otherwise add '>'
                return line.startsWith('>') ? line : `>${line}`;
            })
            .join('\n');
    }

    /**
     * Formats the transcription content according to configured callout format
     */
    private formatContent(transcription: string, audioFilePath?: string): string {
        let format = this.plugin.settings.transcriptionCalloutFormat;

        // If there's no audio file path, remove the audio file link from the format
        if (!audioFilePath) {
            format = format
                .replace(/!?\[\[{audioPath}\]\]\n?/, '') // Remove audio file link and optional newline
                .replace('[[{audioPath}]]', '') // Also try without newline
                .replace('{audioPath}', ''); // Fallback for any other format
        }

        // Format transcription content
        let formattedContent = format
            .replace('{audioPath}', audioFilePath || '')
            .replace('{transcription}', transcription);

        // Only use callout formatting if the format includes callout syntax
        const useCallout = this.isCalloutFormat(format);
        formattedContent = this.formatLines(formattedContent, useCallout);

        return formattedContent + '\n';
    }

    /**
     * Inserts content at the specified position in a file
     */
    private async insertAtPosition(
        content: string,
        file: TFile,
        position: EditorPosition
    ): Promise<void> {
        const fileContent = await this.plugin.app.vault.read(file);
        const lines = fileContent.split('\n');
        const offset = lines
            .slice(0, position.line)
            .reduce((acc, line) => acc + line.length + 1, 0) + position.ch;
        
        const updatedContent = fileContent.slice(0, offset) + content + fileContent.slice(offset);
        await this.plugin.app.vault.modify(file, updatedContent);
    }
}
