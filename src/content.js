(function bootstrapContent(global) {
  if (global.__persistentHighlighterLoaded) {
    return;
  }

  global.__persistentHighlighterLoaded = true;
  const namespace = global.PersistentHighlighter;
  const storage = new namespace.HighlightStorage();
  const renderer = new namespace.HighlightRenderer(storage);
  const notesBoard = new namespace.NotesBoard(storage);

  function buildResponse(payload) {
    return payload;
  }

  async function handleMessage(message) {
    switch (message.type) {
      case "APPLY_HIGHLIGHT": {
        const record = await renderer.applySelectionHighlight(message.color, message.customColor);
        return buildResponse({ ok: true, data: { record: record } });
      }
      case "REMOVE_HIGHLIGHT": {
        await renderer.removeHighlightById(message.highlightId);
        return buildResponse({ ok: true, data: { removedId: message.highlightId } });
      }
      case "CLEAR_HIGHLIGHTS": {
        const removedCount = await renderer.clearCurrentPage();
        return buildResponse({ ok: true, data: { removedCount: removedCount } });
      }
      case "RESTORE_HIGHLIGHTS": {
        const removedCount = await renderer.restoreHighlightsForCurrentPage();
        return buildResponse({ ok: true, data: { removedCount: removedCount } });
      }
      case "CREATE_NOTE": {
        const note = await notesBoard.createNote(message.color);
        return buildResponse({ ok: true, data: { note: note } });
      }
      case "RESTORE_NOTES": {
        const removedCount = await notesBoard.restoreNotesForCurrentPage();
        return buildResponse({ ok: true, data: { removedCount: removedCount } });
      }
      default:
        return buildResponse({ ok: false, error: "Unsupported message type." });
    }
  }

  chrome.runtime.onMessage.addListener(function onMessage(message, _sender, sendResponse) {
    handleMessage(message)
      .then(function sendSuccess(response) {
        sendResponse(response);
      })
      .catch(function sendFailure(error) {
        sendResponse(
          buildResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown content-script error."
          })
        );
      });

    return true;
  });

  document.addEventListener("click", async function onClick(event) {
    const target = event.target;
    const highlight = target && typeof target.closest === "function"
      ? target.closest("." + namespace.HIGHLIGHT_CLASS)
      : null;

    if (!highlight || !event.altKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const highlightId = highlight.getAttribute(namespace.HIGHLIGHT_ATTR);
    if (!highlightId) {
      return;
    }

    try {
      await renderer.removeHighlightById(highlightId);
    } catch (error) {
      console.error("PersistentHighlighter: failed to remove highlight", error);
    }
  });

  document.addEventListener("mouseup", function rememberSelectionOnMouseup() {
    renderer.rememberCurrentSelection();
  });

  document.addEventListener("keyup", function rememberSelectionOnKeyup() {
    renderer.rememberCurrentSelection();
  });

  async function bootstrap() {
    try {
      await renderer.restoreHighlightsForCurrentPage();
      await notesBoard.restoreNotesForCurrentPage();
      renderer.observeDynamicContent();
      notesBoard.observeViewport();
    } catch (error) {
      console.error("PersistentHighlighter: bootstrap failed", error);
    }
  }

  void bootstrap();
})(globalThis);
