(function bootstrapBackground() {
  const colorOptions = [
    { id: "yellow", label: "Amarillo", circle: "\u{1F7E1}" },
    { id: "green", label: "Verde", circle: "\u{1F7E2}" },
    { id: "blue", label: "Azul", circle: "\u{1F535}" },
    { id: "pink", label: "Rosa", circle: "\u{1FA77}" },
    { id: "orange", label: "Naranja", circle: "\u{1F7E0}" },
    { id: "purple", label: "Morado", circle: "\u{1F7E3}" },
    { id: "teal", label: "Turquesa", circle: "\u{1F539}" },
    { id: "gray", label: "Gris", circle: "\u26AA" }
  ];
  const menuRoot = "persistent-highlighter";
  const settingsKey = "persistent-highlighter.settings";

  function createMenus() {
    chrome.contextMenus.removeAll(function onRemoved() {
      chrome.contextMenus.create({
        id: menuRoot,
        title: "Resaltador persistente",
        contexts: ["selection", "page"]
      });

      colorOptions.forEach(function createColorMenu(color) {
        chrome.contextMenus.create({
          id: menuRoot + ":highlight:" + color.id,
          parentId: menuRoot,
          title: color.circle + " " + color.label,
          contexts: ["selection"]
        });
      });

      chrome.contextMenus.create({
        id: menuRoot + ":highlight:custom",
        parentId: menuRoot,
        title: "\u{1F3A8} Ultimo color personalizado",
        contexts: ["selection"]
      });

      chrome.contextMenus.create({
        id: menuRoot + ":clear",
        parentId: menuRoot,
        title: "Limpiar resaltados de esta pagina",
        contexts: ["page"]
      });

      chrome.contextMenus.create({
        id: menuRoot + ":note",
        parentId: menuRoot,
        title: "Nueva nota post-it",
        contexts: ["page"]
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
              files: ["src/types.js", "src/storage.js", "src/highlighter.js", "src/notes.js", "src/content.js"]
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

  async function sendMessageToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (_error) {
      await injectIntoTab(tabId);
      await chrome.tabs.sendMessage(tabId, message);
    }
  }

  function getCustomColorSetting() {
    return new Promise(function resolveColor(resolve) {
      chrome.storage.local.get([settingsKey], function onSettings(items) {
        const color =
          items && items[settingsKey] && typeof items[settingsKey].customColor === "string"
            ? items[settingsKey].customColor
            : "#facc15";
        resolve(color);
      });
    });
  }

  function getNoteColorSetting() {
    return new Promise(function resolveColor(resolve) {
      chrome.storage.local.get([settingsKey], function onSettings(items) {
        const color =
          items && items[settingsKey] && typeof items[settingsKey].noteColor === "string"
            ? items[settingsKey].noteColor
            : "yellow";
        resolve(color);
      });
    });
  }

  chrome.runtime.onInstalled.addListener(function onInstalled() {
    createMenus();
  });

  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(function onStartup() {
      createMenus();
    });
  }

  chrome.contextMenus.onClicked.addListener(async function onClicked(info, tab) {
    if (!tab || !tab.id) {
      return;
    }

    try {
      if (info.menuItemId === menuRoot + ":clear") {
        await sendMessageToTab(tab.id, { type: "CLEAR_HIGHLIGHTS" });
        return;
      }

      if (info.menuItemId === menuRoot + ":note") {
        const noteColor = await getNoteColorSetting();
        await sendMessageToTab(tab.id, { type: "CREATE_NOTE", color: noteColor });
        return;
      }

      if (typeof info.menuItemId === "string" && info.menuItemId.indexOf(menuRoot + ":highlight:") === 0) {
        const color = info.menuItemId.split(":").pop();
        if (color === "custom") {
          const customColor = await getCustomColorSetting();
          await sendMessageToTab(tab.id, {
            type: "APPLY_HIGHLIGHT",
            color: "custom",
            customColor: customColor
          });
          return;
        }

        await sendMessageToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: color });
      }
    } catch (error) {
      console.error("PersistentHighlighter: context menu action failed", error);
    }
  });
})();
