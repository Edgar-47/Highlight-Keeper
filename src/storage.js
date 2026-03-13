(function bootstrapStorage(global) {
  const namespace = global.PersistentHighlighter;

  function HighlightStorage() {}

  HighlightStorage.prototype.getHighlights = async function getHighlights(url) {
    const recordsByUrl = await this.getRecordsByUrl();
    const normalizedUrl = namespace.normalizeUrl(url);
    const records = recordsByUrl[normalizedUrl] || [];
    return records
      .slice()
      .sort(function sortByDate(left, right) {
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      });
  };

  HighlightStorage.prototype.saveHighlight = async function saveHighlight(record) {
    const recordsByUrl = await this.getRecordsByUrl();
    const normalizedUrl = namespace.normalizeUrl(record.url);
    const existing = recordsByUrl[normalizedUrl] || [];
    const deduped = existing.filter(function filterById(item) {
      return item.id !== record.id;
    });

    deduped.push(Object.assign({}, record, { url: normalizedUrl }));
    recordsByUrl[normalizedUrl] = deduped;
    await this.writeRecordsByUrl(recordsByUrl);
    return deduped;
  };

  HighlightStorage.prototype.removeHighlight = async function removeHighlight(url, highlightId) {
    const recordsByUrl = await this.getRecordsByUrl();
    const normalizedUrl = namespace.normalizeUrl(url);
    const existing = recordsByUrl[normalizedUrl] || [];

    recordsByUrl[normalizedUrl] = existing.filter(function filterById(record) {
      return record.id !== highlightId;
    });

    await this.writeRecordsByUrl(recordsByUrl);
    return recordsByUrl[normalizedUrl];
  };

  HighlightStorage.prototype.clearHighlights = async function clearHighlights(url) {
    const recordsByUrl = await this.getRecordsByUrl();
    const normalizedUrl = namespace.normalizeUrl(url);

    delete recordsByUrl[normalizedUrl];
    await this.writeRecordsByUrl(recordsByUrl);
  };

  HighlightStorage.prototype.getSettings = async function getSettings() {
    const items = await this.getFromStorage([namespace.SETTINGS_KEY]);
    return {
      selectedColor:
        items[namespace.SETTINGS_KEY] && items[namespace.SETTINGS_KEY].selectedColor
          ? items[namespace.SETTINGS_KEY].selectedColor
          : namespace.DEFAULT_COLOR
    };
  };

  HighlightStorage.prototype.saveSettings = async function saveSettings(settings) {
    const currentSettings = await this.getSettings();
    const nextSettings = Object.assign({}, currentSettings, settings);
    await this.setInStorage({ [namespace.SETTINGS_KEY]: nextSettings });
    return nextSettings;
  };

  HighlightStorage.prototype.isDuplicate = function isDuplicate(existingRecords, candidate) {
    return existingRecords.some(function findDuplicate(record) {
      return (
        record.signature === candidate.signature &&
        namespace.normalizeText(record.selectedText).toLowerCase() ===
          namespace.normalizeText(candidate.selectedText).toLowerCase()
      );
    });
  };

  HighlightStorage.prototype.findMatchingHighlight = function findMatchingHighlight(existingRecords, candidate) {
    return existingRecords.find(function findMatch(record) {
      return (
        record.signature === candidate.signature &&
        namespace.normalizeText(record.selectedText).toLowerCase() ===
          namespace.normalizeText(candidate.selectedText).toLowerCase()
      );
    });
  };

  HighlightStorage.prototype.getRecordsByUrl = async function getRecordsByUrl() {
    const items = await this.getFromStorage([namespace.STORAGE_KEY]);
    return items[namespace.STORAGE_KEY] || {};
  };

  HighlightStorage.prototype.writeRecordsByUrl = async function writeRecordsByUrl(recordsByUrl) {
    await this.setInStorage({ [namespace.STORAGE_KEY]: recordsByUrl });
  };

  HighlightStorage.prototype.getFromStorage = function getFromStorage(keys) {
    return new Promise(function storageGet(resolve, reject) {
      chrome.storage.local.get(keys, function onStorage(items) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(items);
      });
    });
  };

  HighlightStorage.prototype.setInStorage = function setInStorage(items) {
    return new Promise(function storageSet(resolve, reject) {
      chrome.storage.local.set(items, function onStored() {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve();
      });
    });
  };

  namespace.HighlightStorage = HighlightStorage;
})(globalThis);
