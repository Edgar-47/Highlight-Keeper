(function bootstrapPopup(global) {
  const namespace = global.PersistentHighlighter;
  const storage = new namespace.HighlightStorage();
  let currentTab = null;

  function queryActiveTab() {
    return new Promise(function resolveTab(resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function onTabs(tabs) {
        resolve(tabs[0]);
      });
    });
  }

  function sendMessageToActiveTab(message) {
    return new Promise(function send(resolve, reject) {
      if (!currentTab || !currentTab.id) {
        reject(new Error("No active tab available."));
        return;
      }

      chrome.tabs.sendMessage(currentTab.id, message, function onResponse(response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function injectIntoTab(tabId) {
    return new Promise(function inject(resolve, reject) {
      chrome.scripting.insertCSS(
        {
          target: { tabId: tabId },
          files: ["src/styles.css"]
        },
        function onCssInserted() {
          chrome.scripting.executeScript(
            {
              target: { tabId: tabId },
              files: ["src/types.js", "src/storage.js", "src/highlighter.js", "src/content.js"]
            },
            function onScriptsInjected() {
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

  async function ensureActiveTabReady() {
    if (!currentTab || !currentTab.id) {
      throw new Error("No active tab available.");
    }

    try {
      await sendMessageToActiveTab({ type: "RESTORE_HIGHLIGHTS" });
    } catch (_error) {
      await injectIntoTab(currentTab.id);
    }
  }

  function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error("Missing popup element: " + id);
    }

    return element;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function refresh() {
    const status = getElement("status");
    const list = getElement("highlight-list");
    const count = getElement("highlight-count");
    const pageUrl = getElement("page-url");

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
    highlights.forEach(function renderRow(record) {
      const row = document.createElement("div");
      row.className = "highlight-row";
      row.innerHTML =
        '<div class="highlight-row__meta">' +
        '<span class="color-chip color-chip--' +
        record.color +
        '"></span>' +
        "<div>" +
        '<p class="highlight-row__text">' +
        escapeHtml(record.selectedText) +
        "</p>" +
        '<p class="highlight-row__subtext">' +
        new Date(record.createdAt).toLocaleString() +
        "</p>" +
        "</div>" +
        "</div>" +
        '<button class="text-button" data-highlight-id="' +
        record.id +
        '" type="button">Delete</button>';

      row.querySelector("button").addEventListener("click", async function onDelete() {
        await runAction(async function removeHighlight() {
          await storage.removeHighlight(currentTab.url, record.id);
          try {
            await sendMessageToActiveTab({ type: "REMOVE_HIGHLIGHT", highlightId: record.id });
          } catch (_error) {
            // Storage was already updated.
          }
        });
      });

      list.appendChild(row);
    });

    status.textContent = "Ready.";
  }

  async function runAction(action) {
    const status = getElement("status");
    status.textContent = "Working...";

    try {
      await action();
      await refresh();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Something went wrong.";
    }
  }

  async function bootstrap() {
    const tab = await queryActiveTab();
    if (tab && tab.id && tab.url && /^https?:/i.test(tab.url)) {
      currentTab = { id: tab.id, url: namespace.normalizeUrl(tab.url) };
    }

    const settings = await storage.getSettings();
    const colorButtons = Array.from(document.querySelectorAll("[data-color]"));
    colorButtons.forEach(function wireColor(button) {
      button.classList.toggle("is-active", button.dataset.color === settings.selectedColor);
      button.addEventListener("click", async function onClick() {
        await storage.saveSettings({ selectedColor: button.dataset.color });
        colorButtons.forEach(function syncState(target) {
          target.classList.toggle("is-active", target === button);
        });
      });
    });

    getElement("highlight-selection").addEventListener("click", async function onHighlight() {
      const nextSettings = await storage.getSettings();
      await runAction(async function applyHighlight() {
        await ensureActiveTabReady();
        const response = await sendMessageToActiveTab({
          type: "APPLY_HIGHLIGHT",
          color: nextSettings.selectedColor
        });

        if (!response || !response.ok) {
          throw new Error((response && response.error) || "Unable to apply highlight.");
        }
      });
    });

    getElement("clear-page").addEventListener("click", async function onClear() {
      await runAction(async function clearPage() {
        if (!currentTab) {
          throw new Error("No active tab available.");
        }

        await storage.clearHighlights(currentTab.url);
        try {
          await ensureActiveTabReady();
          const response = await sendMessageToActiveTab({ type: "CLEAR_HIGHLIGHTS" });
          if (!response || !response.ok) {
            throw new Error((response && response.error) || "Unable to clear page highlights.");
          }
        } catch (_error) {
          // Storage was already updated.
        }
      });
    });

    chrome.storage.onChanged.addListener(function onStorageChanged() {
      void refresh();
    });

    await refresh();
  }

  void bootstrap().catch(function onError(error) {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = error instanceof Error ? error.message : "Popup failed to load.";
    }
  });
})(globalThis);
