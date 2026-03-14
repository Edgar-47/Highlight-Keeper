(function bootstrapStorage(global) {
  const ns = global.PersistentHighlighter;

  function HighlightStorage() {}

  // ═══════════════════════════════════════════════════════════
  // HIGHLIGHTS
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.getHighlights = async function getHighlights(url) {
    const byUrl = await this._getRecordsByUrl();
    const key   = ns.normalizeUrl(url);
    return (byUrl[key] || []).slice().sort(_byDate);
  };

  HighlightStorage.prototype.getAllHighlights = async function getAllHighlights() {
    const byUrl = await this._getRecordsByUrl();
    const all   = [];
    Object.values(byUrl).forEach(function(records) { all.push.apply(all, records); });
    return all.sort(_byDate);
  };

  HighlightStorage.prototype.saveHighlight = async function saveHighlight(record) {
    const byUrl = await this._getRecordsByUrl();
    const key   = ns.normalizeUrl(record.url);
    const list  = byUrl[key] || [];
    const idx   = list.findIndex(function(r) { return r.id === record.id; });
    if (idx >= 0) list[idx] = Object.assign({}, record, { url: key });
    else list.push(Object.assign({}, record, { url: key }));
    byUrl[key] = list;
    await this._writeRecordsByUrl(byUrl);
    return list;
  };

  HighlightStorage.prototype.removeHighlight = async function removeHighlight(url, id) {
    const byUrl = await this._getRecordsByUrl();
    const key   = ns.normalizeUrl(url);
    byUrl[key]  = (byUrl[key] || []).filter(function(r) { return r.id !== id; });
    await this._writeRecordsByUrl(byUrl);
    return byUrl[key];
  };

  HighlightStorage.prototype.clearHighlights = async function clearHighlights(url) {
    const byUrl = await this._getRecordsByUrl();
    delete byUrl[ns.normalizeUrl(url)];
    await this._writeRecordsByUrl(byUrl);
  };

  // Actualiza campos específicos de un resaltado (etiquetas, favorito, comentario…)
  HighlightStorage.prototype.patchHighlight = async function patchHighlight(url, id, patch) {
    const byUrl = await this._getRecordsByUrl();
    const key   = ns.normalizeUrl(url);
    const list  = byUrl[key] || [];
    const idx   = list.findIndex(function(r) { return r.id === id; });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    byUrl[key] = list;
    await this._writeRecordsByUrl(byUrl);
    return list[idx];
  };

  HighlightStorage.prototype.isDuplicate = function isDuplicate(existing, candidate) {
    return existing.some(function(r) {
      return r.signature === candidate.signature &&
        ns.normalizeText(r.selectedText).toLowerCase() ===
        ns.normalizeText(candidate.selectedText).toLowerCase();
    });
  };

  HighlightStorage.prototype.findMatchingHighlight = function findMatchingHighlight(existing, candidate) {
    return existing.find(function(r) {
      return r.signature === candidate.signature &&
        ns.normalizeText(r.selectedText).toLowerCase() ===
        ns.normalizeText(candidate.selectedText).toLowerCase();
    });
  };

  // ═══════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.getNotes = async function getNotes(url) {
    const byUrl = await this._getNotesByUrl();
    const key   = ns.normalizeUrl(url);
    return (byUrl[key] || []).slice().sort(_byDate);
  };

  HighlightStorage.prototype.getAllNotes = async function getAllNotes() {
    const byUrl = await this._getNotesByUrl();
    const all   = [];
    Object.values(byUrl).forEach(function(notes) { all.push.apply(all, notes); });
    return all.sort(_byDate);
  };

  HighlightStorage.prototype.saveNote = async function saveNote(note) {
    const byUrl = await this._getNotesByUrl();
    const key   = ns.normalizeUrl(note.url);
    const list  = byUrl[key] || [];
    const idx   = list.findIndex(function(n) { return n.id === note.id; });
    if (idx >= 0) list[idx] = Object.assign({}, note, { url: key });
    else list.push(Object.assign({}, note, { url: key }));
    byUrl[key] = list;
    await this._writeNotesByUrl(byUrl);
    return list;
  };

  HighlightStorage.prototype.removeNote = async function removeNote(url, id) {
    const byUrl = await this._getNotesByUrl();
    const key   = ns.normalizeUrl(url);
    byUrl[key]  = (byUrl[key] || []).filter(function(n) { return n.id !== id; });
    await this._writeNotesByUrl(byUrl);
    return byUrl[key];
  };

  HighlightStorage.prototype.clearNotes = async function clearNotes(url) {
    const byUrl = await this._getNotesByUrl();
    delete byUrl[ns.normalizeUrl(url)];
    await this._writeNotesByUrl(byUrl);
  };

  HighlightStorage.prototype.patchNote = async function patchNote(url, id, patch) {
    const byUrl = await this._getNotesByUrl();
    const key   = ns.normalizeUrl(url);
    const list  = byUrl[key] || [];
    const idx   = list.findIndex(function(n) { return n.id === id; });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    byUrl[key] = list;
    await this._writeNotesByUrl(byUrl);
    return list[idx];
  };

  // ═══════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.getSettings = async function getSettings() {
    const items = await this._get([ns.SETTINGS_KEY]);
    const s     = items[ns.SETTINGS_KEY] || {};
    return {
      selectedColor: s.selectedColor || ns.DEFAULT_COLOR,
      customColor:   ns.sanitizeColorHex(s.customColor),
      noteColor:     s.noteColor     || "yellow",
      darkMode:      Boolean(s.darkMode),
      readingMode:   Boolean(s.readingMode),
      globalTags:    Array.isArray(s.globalTags) ? s.globalTags : []
    };
  };

  HighlightStorage.prototype.saveSettings = async function saveSettings(patch) {
    const current = await this.getSettings();
    const next    = Object.assign({}, current, patch);
    await this._set({ [ns.SETTINGS_KEY]: next });
    return next;
  };

  // ═══════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype.exportAll = async function exportAll() {
    const highlights = await this.getAllHighlights();
    const notes      = await this.getAllNotes();
    return {
      version:    "2.0",
      exportedAt: new Date().toISOString(),
      highlights: highlights,
      notes:      notes
    };
  };

  HighlightStorage.prototype.importAll = async function importAll(data) {
    if (!data || data.version !== "2.0") {
      throw new Error("Formato de archivo no compatible.");
    }

    // Importamos resaltados
    const hlByUrl = await this._getRecordsByUrl();
    (data.highlights || []).forEach(function(record) {
      const key  = ns.normalizeUrl(record.url);
      const list = hlByUrl[key] || [];
      if (!list.find(function(r) { return r.id === record.id; })) list.push(record);
      hlByUrl[key] = list;
    });
    await this._writeRecordsByUrl(hlByUrl);

    // Importamos notas
    const notesByUrl = await this._getNotesByUrl();
    (data.notes || []).forEach(function(note) {
      const key  = ns.normalizeUrl(note.url);
      const list = notesByUrl[key] || [];
      if (!list.find(function(n) { return n.id === note.id; })) list.push(note);
      notesByUrl[key] = list;
    });
    await this._writeNotesByUrl(notesByUrl);

    return {
      highlights: data.highlights.length,
      notes: data.notes.length
    };
  };

  // ═══════════════════════════════════════════════════════════
  // INTERNOS
  // ═══════════════════════════════════════════════════════════

  HighlightStorage.prototype._getRecordsByUrl = async function _getRecordsByUrl() {
    const items = await this._get([ns.STORAGE_KEY]);
    return items[ns.STORAGE_KEY] || {};
  };

  HighlightStorage.prototype._writeRecordsByUrl = async function _writeRecordsByUrl(data) {
    await this._set({ [ns.STORAGE_KEY]: data });
  };

  HighlightStorage.prototype._getNotesByUrl = async function _getNotesByUrl() {
    const items = await this._get([ns.NOTES_STORAGE_KEY]);
    return items[ns.NOTES_STORAGE_KEY] || {};
  };

  HighlightStorage.prototype._writeNotesByUrl = async function _writeNotesByUrl(data) {
    await this._set({ [ns.NOTES_STORAGE_KEY]: data });
  };

  HighlightStorage.prototype._get = function _get(keys) {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.get(keys, function(items) {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(items);
      });
    });
  };

  HighlightStorage.prototype._set = function _set(items) {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.set(items, function() {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  };

  // Helper de ordenación por fecha
  function _byDate(a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  ns.HighlightStorage = HighlightStorage;
})(globalThis);
