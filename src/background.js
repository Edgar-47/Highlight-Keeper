(function bootstrapBackground() {
  const colorOptions = [
    { id: "yellow", label: "Amarillo" },
    { id: "green", label: "Verde" },
    { id: "blue", label: "Azul" },
    { id: "pink", label: "Rosa" },
    { id: "orange", label: "Naranja" },
    { id: "purple", label: "Morado" },
    { id: "teal", label: "Turquesa" },
    { id: "gray", label: "Gris" }
  ];
  const menuRoot = "persistent-highlighter";

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
          title: "Resaltar en " + color.label,
          contexts: ["selection"]
        });
      });

      chrome.contextMenus.create({
        id: menuRoot + ":clear",
        parentId: menuRoot,
        title: "Limpiar resaltados de esta página",
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

  async function sendMessageToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (_error) {
      await injectIntoTab(tabId);
      await chrome.tabs.sendMessage(tabId, message);
    }
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

      if (typeof info.menuItemId === "string" && info.menuItemId.indexOf(menuRoot + ":highlight:") === 0) {
        const color = info.menuItemId.split(":").pop();
        await sendMessageToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: color });
      }
    } catch (error) {
      console.error("PersistentHighlighter: context menu action failed", error);
    }
  });
})();
