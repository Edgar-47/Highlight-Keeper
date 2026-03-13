/// <reference path="./types.ts" />
/// <reference path="./storage.ts" />
/// <reference path="./highlighter.ts" />
/// <reference path="./notes.ts" />

namespace PersistentHighlighter {
  const contentWindow = window as Window & { __persistentHighlighterLoaded?: boolean };
  if (contentWindow.__persistentHighlighterLoaded) {
    // Avoid duplicate listeners when the popup injects the content scripts on demand.
  } else {
    contentWindow.__persistentHighlighterLoaded = true;

    const storage = new HighlightStorage();
    const renderer = new HighlightRenderer(storage);
    const notesBoard = new NotesBoard(storage);

    function buildResponse<T>(payload: ExtensionResponse<T>): ExtensionResponse<T> {
      return payload;
    }

    async function handleMessage(
      message: ExtensionMessage
    ): Promise<ExtensionResponse<HighlightOperationResult>> {
      switch (message.type) {
        case "APPLY_HIGHLIGHT": {
          const record = await renderer.applySelectionHighlight(message.color, message.customColor);
          return buildResponse({ ok: true, data: { record } });
        }
        case "REMOVE_HIGHLIGHT": {
          await renderer.removeHighlightById(message.highlightId);
          return buildResponse({ ok: true, data: { removedId: message.highlightId } });
        }
        case "CLEAR_HIGHLIGHTS": {
          const removedCount = await renderer.clearCurrentPage();
          return buildResponse({ ok: true, data: { removedCount } });
        }
        case "RESTORE_HIGHLIGHTS": {
          const removedCount = await renderer.restoreHighlightsForCurrentPage();
          return buildResponse({ ok: true, data: { removedCount } });
        }
        case "CREATE_NOTE": {
          const note = await notesBoard.createNote(message.color);
          return buildResponse({ ok: true, data: { note } });
        }
        case "RESTORE_NOTES": {
          const removedCount = await notesBoard.restoreNotesForCurrentPage();
          return buildResponse({ ok: true, data: { removedCount } });
        }
        default:
          return buildResponse({ ok: false, error: "Unsupported message type." });
      }
    }

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      handleMessage(message)
        .then((response) => sendResponse(response))
        .catch((error: unknown) =>
          sendResponse(
            buildResponse({
              ok: false,
              error: error instanceof Error ? error.message : "Unknown content-script error."
            })
          )
        );

      return true;
    });

    document.addEventListener("click", async (event) => {
      const target = event.target as HTMLElement | null;
      const highlight = target?.closest?.(`.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
      if (!highlight || !event.altKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const highlightId = highlight.getAttribute(HIGHLIGHT_ATTR);
      if (!highlightId) {
        return;
      }

      try {
        await renderer.removeHighlightById(highlightId);
      } catch (error) {
        console.error("PersistentHighlighter: failed to remove highlight", error);
      }
    });

    document.addEventListener("mouseup", () => {
      renderer.rememberCurrentSelection();
    });

    document.addEventListener("keyup", () => {
      renderer.rememberCurrentSelection();
    });

    async function bootstrap(): Promise<void> {
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
  }
}
