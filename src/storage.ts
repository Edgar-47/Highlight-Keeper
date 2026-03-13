/// <reference path="./types.ts" />

namespace PersistentHighlighter {
  type RecordsByUrl = Record<string, HighlightRecord[]>;

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
        selectedColor: items[SETTINGS_KEY]?.selectedColor || DEFAULT_COLOR
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

    private async getRecordsByUrl(): Promise<RecordsByUrl> {
      const items = await this.getFromStorage<{ [STORAGE_KEY]?: RecordsByUrl }>([STORAGE_KEY]);
      return items[STORAGE_KEY] || {};
    }

    private async writeRecordsByUrl(recordsByUrl: RecordsByUrl): Promise<void> {
      await this.setInStorage({ [STORAGE_KEY]: recordsByUrl });
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
