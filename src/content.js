(function bootstrapContent(global) {
  if (global.__annotateLoaded) return;
  global.__annotateLoaded = true;

  const ns      = global.PersistentHighlighter;
  const storage = new ns.HighlightStorage();
  const renderer  = new ns.HighlightRenderer(storage);
  const notesBoard = new ns.NotesBoard(storage);

  // ── Manejador central de mensajes ─────────────────────────────────────────
  async function handleMessage(msg) {
    switch (msg.type) {
      case "APPLY_HIGHLIGHT": {
        const record = await renderer.applySelectionHighlight(msg.color, msg.customColor);
        return { ok: true, data: { record } };
      }
      case "REMOVE_HIGHLIGHT": {
        await renderer.removeHighlightById(msg.highlightId);
        return { ok: true, data: { removedId: msg.highlightId } };
      }
      case "CLEAR_HIGHLIGHTS": {
        const removedCount = await renderer.clearCurrentPage();
        return { ok: true, data: { removedCount } };
      }
      case "RESTORE_HIGHLIGHTS": {
        const removedCount = await renderer.restoreHighlightsForCurrentPage();
        return { ok: true, data: { removedCount } };
      }
      case "CREATE_NOTE": {
        const note = await notesBoard.createNote(msg.color);
        return { ok: true, data: { note } };
      }
      case "CREATE_NOTE_FROM_SELECTION": {
        // Crea una nota pre-rellenada con el texto seleccionado
        const sel  = window.getSelection();
        const text = sel ? ns.normalizeText(sel.toString()) : "";
        const note = text
          ? await notesBoard.createNoteFromText(msg.color, text)
          : await notesBoard.createNote(msg.color);
        return { ok: true, data: { note } };
      }
      case "RESTORE_NOTES": {
        const removedCount = await notesBoard.restoreNotesForCurrentPage();
        return { ok: true, data: { removedCount } };
      }
      case "PATCH_HIGHLIGHT": {
        const updated = await storage.patchHighlight(window.location.href, msg.highlightId, msg.patch);
        return { ok: true, data: { updated } };
      }
      default:
        return { ok: false, error: "Tipo de mensaje no soportado." };
    }
  }

  chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
    handleMessage(msg)
      .then(sendResponse)
      .catch(function(err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : "Error desconocido." });
      });
    return true; // respuesta asíncrona
  });

  // ── Alt+Click para eliminar resaltado ─────────────────────────────────────
  document.addEventListener("click", async function(event) {
    const target = event.target;
    const hl = target && typeof target.closest === "function"
      ? target.closest("." + ns.HIGHLIGHT_CLASS)
      : null;
    if (!hl || !event.altKey) return;

    event.preventDefault();
    event.stopPropagation();

    const id = hl.getAttribute(ns.HIGHLIGHT_ATTR);
    if (!id) return;

    try {
      await renderer.removeHighlightById(id);
    } catch (err) {
      console.error("Annotate: no se pudo eliminar el resaltado", err);
    }
  });

  // ── Recordar selección activa para uso desde popup ────────────────────────
  document.addEventListener("mouseup",  () => renderer.rememberCurrentSelection());
  document.addEventListener("keyup",    () => renderer.rememberCurrentSelection());

  // ── Bootstrap: restaurar resaltados y notas al cargar ────────────────────
  async function bootstrap() {
    try {
      await renderer.restoreHighlightsForCurrentPage();
      await notesBoard.restoreNotesForCurrentPage();
      renderer.observeDynamicContent();
      notesBoard.observeViewport();
    } catch (err) {
      console.error("Annotate: error en bootstrap", err);
    }
  }

  void bootstrap();
})(globalThis);
