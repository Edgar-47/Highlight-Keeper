/// <reference path="./types.ts" />

namespace PersistentHighlighter {
  type RecordsByUrl = Record<string, HighlightRecord[]>;
  type NotesByUrl = Record<string, PostItNote[]>;

  export class HighlightStorage {
    async getHighlights(url: string): Promise<HighlightRecord[]> {
      const recordsByUrl = await this.getRecordsByUrl();
      const normalizedUrl = normalizeUrl(url);
      const records = recordsByUrl[normalizedUrl] || [];
      return records
        .slice()
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    }

    async saveHighlight(record: HighlightRecord): Promise<HighlightRecord[]> {
      const recordsByUrl = await this.getRecordsByUrl();
      const normalizedUrl = normalizeUrl(record.url);
      const existing = recordsByUrl[normalizedUrl] || [];
      const deduped = existing.filter((item) => item.id !== record.id);
      deduped.push({ ...record, url: normalizedUrl });
      recordsByUrl[normalizedUrl] = deduped;
      await this.writeRecordsByUrl(recordsByUrl);
      return deduped;
    }

    async removeHighlight(url: string, highlightId: string): Promise<HighlightRecord[]> {
      const recordsByUrl = await this.getRecordsByUrl();
      const normalizedUrl = normalizeUrl(url);
      const existing = recordsByUrl[normalizedUrl] || [];
      recordsByUrl[normalizedUrl] = existing.filter((record) => record.id !== highlightId);
      await this.writeRecordsByUrl(recordsByUrl);
      return recordsByUrl[normalizedUrl];
    }

    async clearHighlights(url: string): Promise<void> {
      const recordsByUrl = await this.getRecordsByUrl();
      const normalizedUrl = normalizeUrl(url);
      delete recordsByUrl[normalizedUrl];
      await this.writeRecordsByUrl(recordsByUrl);
    }

    async getSettings(): Promise<PopupSettings> {
      const items = await this.getFromStorage<{ [SETTINGS_KEY]?: PopupSettings }>([SETTINGS_KEY]);
      return {
        selectedColor: items[SETTINGS_KEY]?.selectedColor || DEFAULT_COLOR,
        customColor: sanitizeColorHex(items[SETTINGS_KEY]?.customColor),
        noteColor: items[SETTINGS_KEY]?.noteColor || "yellow"
      };
    }

    async saveSettings(settings: Partial<PopupSettings>): Promise<PopupSettings> {
      const currentSettings = await this.getSettings();
      const nextSettings = { ...currentSettings, ...settings };
      await this.setInStorage({ [SETTINGS_KEY]: nextSettings });
      return nextSettings;
    }

    isDuplicate(existingRecords: HighlightRecord[], candidate: HighlightRecord): boolean {
      return existingRecords.some(
        (record) =>
          record.signature === candidate.signature &&
          normalizeText(record.selectedText).toLowerCase() === normalizeText(candidate.selectedText).toLowerCase()
      );
    }

    findMatchingHighlight(existingRecords: HighlightRecord[], candidate: HighlightRecord): HighlightRecord | undefined {
      return existingRecords.find(
        (record) =>
          record.signature === candidate.signature &&
          normalizeText(record.selectedText).toLowerCase() === normalizeText(candidate.selectedText).toLowerCase()
      );
    }

    async getNotes(url: string): Promise<PostItNote[]> {
      const notesByUrl = await this.getNotesByUrl();
      const normalizedUrl = normalizeUrl(url);
      const notes = notesByUrl[normalizedUrl] || [];
      return notes
        .slice()
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    }

    async saveNote(note: PostItNote): Promise<PostItNote[]> {
      const notesByUrl = await this.getNotesByUrl();
      const normalizedUrl = normalizeUrl(note.url);
      const existing = notesByUrl[normalizedUrl] || [];
      const deduped = existing.filter((item) => item.id !== note.id);
      deduped.push({ ...note, url: normalizedUrl });
      notesByUrl[normalizedUrl] = deduped;
      await this.writeNotesByUrl(notesByUrl);
      return deduped;
    }

    async removeNote(url: string, noteId: string): Promise<PostItNote[]> {
      const notesByUrl = await this.getNotesByUrl();
      const normalizedUrl = normalizeUrl(url);
      const existing = notesByUrl[normalizedUrl] || [];
      notesByUrl[normalizedUrl] = existing.filter((note) => note.id !== noteId);
      await this.writeNotesByUrl(notesByUrl);
      return notesByUrl[normalizedUrl];
    }

    async clearNotes(url: string): Promise<void> {
      const notesByUrl = await this.getNotesByUrl();
      const normalizedUrl = normalizeUrl(url);
      delete notesByUrl[normalizedUrl];
      await this.writeNotesByUrl(notesByUrl);
    }

    private async getRecordsByUrl(): Promise<RecordsByUrl> {
      const items = await this.getFromStorage<{ [STORAGE_KEY]?: RecordsByUrl }>([STORAGE_KEY]);
      return items[STORAGE_KEY] || {};
    }

    private async writeRecordsByUrl(recordsByUrl: RecordsByUrl): Promise<void> {
      await this.setInStorage({ [STORAGE_KEY]: recordsByUrl });
    }

    private async getNotesByUrl(): Promise<NotesByUrl> {
      const items = await this.getFromStorage<{ [NOTES_STORAGE_KEY]?: NotesByUrl }>([NOTES_STORAGE_KEY]);
      return items[NOTES_STORAGE_KEY] || {};
    }

    private async writeNotesByUrl(notesByUrl: NotesByUrl): Promise<void> {
      await this.setInStorage({ [NOTES_STORAGE_KEY]: notesByUrl });
    }

    private getFromStorage<T>(keys: string[]): Promise<T> {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (items) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve(items as T);
        });
      });
    }

    private setInStorage(items: Record<string, unknown>): Promise<void> {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve();
        });
      });
    }
  }
}
