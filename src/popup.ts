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
          reject(new Error("No active tab available."));
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
              files: ["src/types.js", "src/storage.js", "src/highlighter.js", "src/content.js"]
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
      throw new Error("No active tab available.");
    }

    try {
      await sendMessageToActiveTab({ type: "RESTORE_HIGHLIGHTS" });
    } catch (_error) {
      await injectIntoTab(currentTab.id);
    }
  }

  function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T | null;
    if (!element) {
      throw new Error(`Missing popup element: ${id}`);
    }

    return element;
  }

  async function refresh(): Promise<void> {
    const status = getElement<HTMLParagraphElement>("status");
    const list = getElement<HTMLDivElement>("highlight-list");
    const count = getElement<HTMLSpanElement>("highlight-count");
    const pageUrl = getElement<HTMLParagraphElement>("page-url");

    if (!currentTab) {
      status.textContent = "Open a regular webpage to use highlighting.";
      list.innerHTML = "";
      count.textContent = "0";
      pageUrl.textContent = "Unsupported page";
      return;
    }

    const highlights = await storage.getHighlights(currentTab.url);
    count.textContent = String(highlights.length);
    pageUrl.textContent = currentTab.url;

    if (!highlights.length) {
      list.innerHTML = '<p class="empty-state">No saved highlights for this page yet.</p>';
      status.textContent = "Ready.";
      return;
    }

    list.innerHTML = "";
    for (const record of highlights) {
      const row = document.createElement("div");
      row.className = "highlight-row";
      row.innerHTML = `
        <div class="highlight-row__meta">
          <span class="color-chip color-chip--${record.color}"></span>
          <div>
            <p class="highlight-row__text">${escapeHtml(record.selectedText)}</p>
            <p class="highlight-row__subtext">${new Date(record.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <button class="text-button" data-highlight-id="${record.id}" type="button">Delete</button>
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

    status.textContent = "Ready.";
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
    status.textContent = "Working...";

    try {
      await action();
      await refresh();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Something went wrong.";
    }
  }

  async function bootstrap(): Promise<void> {
    const tab = await queryActiveTab();
    if (tab?.id && tab.url && /^https?:/i.test(tab.url)) {
      currentTab = { id: tab.id, url: PersistentHighlighter.normalizeUrl(tab.url) };
    }

    const settings = await storage.getSettings();
    const colorButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-color]"));
    for (const button of colorButtons) {
      button.classList.toggle("is-active", button.dataset.color === settings.selectedColor);
      button.addEventListener("click", async () => {
        const color = button.dataset.color as PersistentHighlighter.HighlightColor;
        await storage.saveSettings({ selectedColor: color });
        for (const target of colorButtons) {
          target.classList.toggle("is-active", target === button);
        }
      });
    }

    getElement<HTMLButtonElement>("highlight-selection").addEventListener("click", async () => {
      const nextSettings = await storage.getSettings();
      await runAction(async () => {
        await ensureActiveTabReady();
        const response = await sendMessageToActiveTab({
          type: "APPLY_HIGHLIGHT",
          color: nextSettings.selectedColor
        });

        if (!response?.ok) {
          throw new Error(response?.error || "Unable to apply highlight.");
        }
      });
    });

    getElement<HTMLButtonElement>("clear-page").addEventListener("click", async () => {
      await runAction(async () => {
        if (!currentTab) {
          throw new Error("No active tab available.");
        }

        await storage.clearHighlights(currentTab.url);
        try {
          await ensureActiveTabReady();
          const response = await sendMessageToActiveTab({ type: "CLEAR_HIGHLIGHTS" });
          if (!response?.ok) {
            throw new Error(response?.error || "Unable to clear page highlights.");
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
      status.textContent = error instanceof Error ? error.message : "Popup failed to load.";
    }
  });
}
