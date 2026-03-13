/// <reference path="./types.ts" />
/// <reference path="./storage.ts" />

namespace PersistentHighlighterPopup {
  const storage = new PersistentHighlighter.HighlightStorage();

  interface ActiveTabState {
    id: number;
    url: string;
  }

  let currentTab: ActiveTabState | null = null;

  function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
    });
  }

  function sendMessageToActiveTab(message: PersistentHighlighter.ExtensionMessage) {
    return new Promise<PersistentHighlighter.ExtensionResponse<PersistentHighlighter.HighlightOperationResult>>(
      (resolve, reject) => {
        if (!currentTab?.id) {
          reject(new Error("No hay una pestaña activa disponible."));
          return;
        }

        chrome.tabs.sendMessage(currentTab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve(response);
        });
      }
    );
  }

  function injectIntoTab(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.scripting.insertCSS(
        {
          target: { tabId },
          files: ["src/styles.css"]
        },
        () => {
          chrome.scripting.executeScript(
            {
              target: { tabId },
              files: ["src/types.js", "src/storage.js", "src/highlighter.js", "src/notes.js", "src/content.js"]
            },
            () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              resolve();
            }
          );
        }
      );
    });
  }

  async function ensureActiveTabReady(): Promise<void> {
    if (!currentTab?.id) {
      throw new Error("No hay una pestaña activa disponible.");
    }

    try {
      // Rehidratamos ambos modulos para dejar la pestana lista aunque se abriese antes de cargar la extension.
      await sendMessageToActiveTab({ type: "RESTORE_HIGHLIGHTS" });
      await sendMessageToActiveTab({ type: "RESTORE_NOTES" });
    } catch (_error) {
      await injectIntoTab(currentTab.id);
    }
  }

  function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T | null;
    if (!element) {
      throw new Error(`Falta un elemento de la interfaz: ${id}`);
    }

    return element;
  }

  function renderColorOptions(selectedColor: PersistentHighlighter.HighlightColor): void {
    const container = getElement<HTMLDivElement>("color-options");
    container.innerHTML = "";

    for (const color of PersistentHighlighter.COLOR_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.color = color.id;
      button.className = `color-option ${button.dataset.color === selectedColor ? "is-active" : ""}`;
      button.innerHTML = `
        <span class="color-option__swatch color-option--${color.id}"></span>
        <span class="color-option__label">${color.label}</span>
      `;

      button.addEventListener("click", async () => {
        await storage.saveSettings({ selectedColor: color.id });
        renderColorOptions(color.id);
      });

      container.appendChild(button);
    }
  }

  function renderNoteColorOptions(selectedColor: PersistentHighlighter.NoteColor): void {
    const container = getElement<HTMLDivElement>("note-color-options");
    container.innerHTML = "";

    for (const color of PersistentHighlighter.NOTE_COLOR_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.noteColor = color.id;
      button.className = `note-color-option note-color-option--${color.id} ${color.id === selectedColor ? "is-active" : ""}`;
      button.setAttribute("aria-label", `Color ${color.label}`);
      button.addEventListener("click", async () => {
        await storage.saveSettings({ noteColor: color.id });
        renderNoteColorOptions(color.id);
      });
      container.appendChild(button);
    }
  }

  function updateCustomColorPreview(color: string): void {
    const preview = getElement<HTMLSpanElement>("custom-color-preview");
    preview.style.backgroundColor = PersistentHighlighter.sanitizeColorHex(color);
  }

  async function refresh(): Promise<void> {
    const status = getElement<HTMLParagraphElement>("status");
    const list = getElement<HTMLDivElement>("highlight-list");
    const count = getElement<HTMLSpanElement>("highlight-count");
    const noteCount = getElement<HTMLSpanElement>("note-count");
    const pageUrl = getElement<HTMLParagraphElement>("page-url");

    if (!currentTab) {
      status.textContent = "Abre una web normal para usar el resaltado.";
      list.innerHTML = "";
      count.textContent = "0";
      noteCount.textContent = "0";
      pageUrl.textContent = "Página no compatible";
      return;
    }

    const highlights = await storage.getHighlights(currentTab.url);
    const notes = await storage.getNotes(currentTab.url);
    count.textContent = String(highlights.length);
    noteCount.textContent = String(notes.length);
    pageUrl.textContent = currentTab.url;

    if (!highlights.length) {
      list.innerHTML = '<p class="empty-state">Todavía no hay resaltados guardados en esta página.</p>';
      status.textContent = "Listo.";
      return;
    }

    list.innerHTML = "";
    for (const record of highlights) {
      const row = document.createElement("div");
      row.className = "highlight-row";
      const chipStyle = record.customColor ? `style="background:${record.customColor}"` : "";
      row.innerHTML = `
        <div class="highlight-row__meta">
          <span class="color-chip ${record.customColor ? "" : `color-chip--${record.color}`}" ${chipStyle}></span>
          <div>
            <p class="highlight-row__text">${escapeHtml(record.selectedText)}</p>
            <p class="highlight-row__subtext">${new Date(record.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <button class="text-button" data-highlight-id="${record.id}" type="button">Borrar</button>
      `;

      row.querySelector("button")?.addEventListener("click", async () => {
        await runAction(async () => {
          await storage.removeHighlight(currentTab!.url, record.id);
          try {
            await sendMessageToActiveTab({ type: "REMOVE_HIGHLIGHT", highlightId: record.id });
          } catch (_error) {
            // The page may no longer accept messages. Storage was already updated.
          }
        });
      });

      list.appendChild(row);
    }

    status.textContent = "Listo.";
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    const status = getElement<HTMLParagraphElement>("status");
    status.textContent = "Trabajando...";

    try {
      // Centralizamos el feedback para que todas las acciones sigan el mismo flujo.
      await action();
      await refresh();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Ha ocurrido un error.";
    }
  }

  async function bootstrap(): Promise<void> {
    const tab = await queryActiveTab();
    if (tab?.id && tab.url && /^https?:/i.test(tab.url)) {
      currentTab = { id: tab.id, url: PersistentHighlighter.normalizeUrl(tab.url) };
    }

    const settings = await storage.getSettings();
    renderColorOptions(settings.selectedColor);
    renderNoteColorOptions(settings.noteColor);
    getElement<HTMLInputElement>("custom-color-input").value = settings.customColor;
    updateCustomColorPreview(settings.customColor);

    getElement<HTMLInputElement>("custom-color-input").addEventListener("input", (event) => {
      const nextColor = PersistentHighlighter.sanitizeColorHex((event.target as HTMLInputElement).value);
      updateCustomColorPreview(nextColor);
    });

    getElement<HTMLButtonElement>("use-custom-color").addEventListener("click", async () => {
      const input = getElement<HTMLInputElement>("custom-color-input");
      const customColor = PersistentHighlighter.sanitizeColorHex(input.value);
      input.value = customColor;
      updateCustomColorPreview(customColor);
      await storage.saveSettings({ selectedColor: "custom", customColor });
      renderColorOptions("custom");
    });

    getElement<HTMLButtonElement>("create-note").addEventListener("click", async () => {
      const nextSettings = await storage.getSettings();
      await runAction(async () => {
        await ensureActiveTabReady();
        const response = await sendMessageToActiveTab({
          type: "CREATE_NOTE",
          color: nextSettings.noteColor
        });

        if (!response?.ok) {
          throw new Error(response?.error || "No se pudo crear la nota.");
        }
      });
    });

    getElement<HTMLButtonElement>("highlight-selection").addEventListener("click", async () => {
      const nextSettings = await storage.getSettings();
      await runAction(async () => {
        await ensureActiveTabReady();
        const response = await sendMessageToActiveTab({
          type: "APPLY_HIGHLIGHT",
          color: nextSettings.selectedColor,
          customColor: nextSettings.customColor
        });

        if (!response?.ok) {
          throw new Error(response?.error || "No se pudo aplicar el resaltado.");
        }
      });
    });

    getElement<HTMLButtonElement>("restore-page").addEventListener("click", async () => {
      await runAction(async () => {
        await ensureActiveTabReady();
        const response = await sendMessageToActiveTab({ type: "RESTORE_HIGHLIGHTS" });
        if (!response?.ok) {
          throw new Error(response?.error || "No se pudieron reaplicar los resaltados.");
        }
      });
    });

    getElement<HTMLButtonElement>("clear-page").addEventListener("click", async () => {
      await runAction(async () => {
        if (!currentTab) {
          throw new Error("No hay una pestaña activa disponible.");
        }

        await storage.clearHighlights(currentTab.url);
        try {
          await ensureActiveTabReady();
          const response = await sendMessageToActiveTab({ type: "CLEAR_HIGHLIGHTS" });
          if (!response?.ok) {
            throw new Error(response?.error || "No se pudieron limpiar los resaltados.");
          }
        } catch (_error) {
          // Storage was already updated. Ignore page messaging failures here.
        }
      });
    });

    chrome.storage.onChanged.addListener(() => {
      void refresh();
    });

    await refresh();
  }

  void bootstrap().catch((error) => {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = error instanceof Error ? error.message : "La ventana no se pudo cargar.";
    }
  });
}
