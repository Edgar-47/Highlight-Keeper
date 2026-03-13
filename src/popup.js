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
        reject(new Error("No hay una pestaña activa disponible."));
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
      throw new Error("No hay una pestaña activa disponible.");
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
      throw new Error("Falta un elemento de la interfaz: " + id);
    }

    return element;
  }

  function renderColorOptions(selectedColor) {
    const container = getElement("color-options");
    container.innerHTML = "";

    namespace.COLOR_OPTIONS.forEach(function renderColor(color) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.color = color.id;
      button.className = "color-option" + (color.id === selectedColor ? " is-active" : "");
      button.innerHTML =
        '<span class="color-option__swatch color-option--' +
        color.id +
        '"></span>' +
        '<span class="color-option__label">' +
        color.label +
        "</span>";

      button.addEventListener("click", async function onColorClick() {
        await storage.saveSettings({ selectedColor: color.id });
        renderColorOptions(color.id);
      });

      container.appendChild(button);
    });
  }

  function updateCustomColorPreview(color) {
    const preview = getElement("custom-color-preview");
    preview.style.backgroundColor = namespace.sanitizeColorHex(color);
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
      status.textContent = "Abre una web normal para usar el resaltado.";
      list.innerHTML = "";
      count.textContent = "0";
      pageUrl.textContent = "Página no compatible";
      return;
    }

    const highlights = await storage.getHighlights(currentTab.url);
    count.textContent = String(highlights.length);
    pageUrl.textContent = currentTab.url;

    if (!highlights.length) {
      list.innerHTML = '<p class="empty-state">Todavía no hay resaltados guardados en esta página.</p>';
      status.textContent = "Listo.";
      return;
    }

    list.innerHTML = "";
    highlights.forEach(function renderRow(record) {
      const row = document.createElement("div");
      row.className = "highlight-row";
      const chipStyle = record.customColor ? ' style="background:' + record.customColor + '"' : "";
      row.innerHTML =
        '<div class="highlight-row__meta">' +
        '<span class="color-chip ' +
        (record.customColor ? "" : "color-chip--" + record.color) +
        '"' +
        chipStyle +
        "></span>" +
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
        '" type="button">Borrar</button>';

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

    status.textContent = "Listo.";
  }

  async function runAction(action) {
    const status = getElement("status");
    status.textContent = "Trabajando...";

    try {
      await action();
      await refresh();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Ha ocurrido un error.";
    }
  }

  async function bootstrap() {
    const tab = await queryActiveTab();
    if (tab && tab.id && tab.url && /^https?:/i.test(tab.url)) {
      currentTab = { id: tab.id, url: namespace.normalizeUrl(tab.url) };
    }

    const settings = await storage.getSettings();
    renderColorOptions(settings.selectedColor);
    getElement("custom-color-input").value = settings.customColor;
    updateCustomColorPreview(settings.customColor);

    getElement("custom-color-input").addEventListener("input", function onInput(event) {
      const nextColor = namespace.sanitizeColorHex(event.target.value);
      updateCustomColorPreview(nextColor);
    });

    getElement("use-custom-color").addEventListener("click", async function onCustomColor() {
      const input = getElement("custom-color-input");
      const customColor = namespace.sanitizeColorHex(input.value);
      input.value = customColor;
      updateCustomColorPreview(customColor);
      await storage.saveSettings({ selectedColor: "custom", customColor: customColor });
      renderColorOptions("custom");
    });

    getElement("highlight-selection").addEventListener("click", async function onHighlight() {
      const nextSettings = await storage.getSettings();
      await runAction(async function applyHighlight() {
        await ensureActiveTabReady();
        const response = await sendMessageToActiveTab({
          type: "APPLY_HIGHLIGHT",
          color: nextSettings.selectedColor,
          customColor: nextSettings.customColor
        });

        if (!response || !response.ok) {
          throw new Error((response && response.error) || "No se pudo aplicar el resaltado.");
        }
      });
    });

    getElement("restore-page").addEventListener("click", async function onRestore() {
      await runAction(async function restorePage() {
        await ensureActiveTabReady();
        const response = await sendMessageToActiveTab({ type: "RESTORE_HIGHLIGHTS" });
        if (!response || !response.ok) {
          throw new Error((response && response.error) || "No se pudieron reaplicar los resaltados.");
        }
      });
    });

    getElement("clear-page").addEventListener("click", async function onClear() {
      await runAction(async function clearPage() {
        if (!currentTab) {
          throw new Error("No hay una pestaña activa disponible.");
        }

        await storage.clearHighlights(currentTab.url);
        try {
          await ensureActiveTabReady();
          const response = await sendMessageToActiveTab({ type: "CLEAR_HIGHLIGHTS" });
          if (!response || !response.ok) {
            throw new Error((response && response.error) || "No se pudieron limpiar los resaltados.");
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
      status.textContent = error instanceof Error ? error.message : "La ventana no se pudo cargar.";
    }
  });
})(globalThis);
