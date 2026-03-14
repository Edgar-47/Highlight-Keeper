/// <reference path="./types.ts" />

namespace PersistentHighlighterBackground {
  const COLOR_OPTIONS = [
    { id: "yellow", label: "Amarillo", circle: "" },
    { id: "green", label: "Verde", circle: "" },
    { id: "blue", label: "Azul", circle: "" },
    { id: "pink", label: "Rosa", circle: "" },
    { id: "orange", label: "Naranja", circle: "" },
    { id: "purple", label: "Morado", circle: "" },
    { id: "teal", label: "Turquesa", circle: "" },
    { id: "gray", label: "Gris", circle: "" }
  ] as const;

  const MENU_ROOT = "persistent-highlighter";
  const SETTINGS_KEY = "persistent-highlighter.settings";

  function createMenus(): void {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ROOT,
        title: "Resaltador persistente",
        contexts: ["selection", "page"]
      });

      for (const color of COLOR_OPTIONS) {
        chrome.contextMenus.create({
          id: `${MENU_ROOT}:highlight:${color.id}`,
          parentId: MENU_ROOT,
          title: color.label,
          contexts: ["selection"]
        });
      }

      chrome.contextMenus.create({
        id: `${MENU_ROOT}:highlight:custom`,
        parentId: MENU_ROOT,
        title: "Ultimo color personalizado",
        contexts: ["selection"]
      });

      chrome.contextMenus.create({
        id: `${MENU_ROOT}:clear`,
        parentId: MENU_ROOT,
        title: "Limpiar resaltados de esta pagina",
        contexts: ["page"]
      });

      chrome.contextMenus.create({
        id: `${MENU_ROOT}:note`,
        parentId: MENU_ROOT,
        title: "Nueva nota",
        contexts: ["page"]
      });
    });
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

  async function sendMessageToTab(tabId: number, message: unknown): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (_error) {
      await injectIntoTab(tabId);
      await chrome.tabs.sendMessage(tabId, message);
    }
  }

  function getCustomColorSetting(): Promise<string> {
    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY], (items) => {
        const color = items?.[SETTINGS_KEY]?.customColor;
        resolve(typeof color === "string" ? color : "#facc15");
      });
    });
  }

  function getNoteColorSetting(): Promise<NoteColor> {
    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY], (items) => {
        const color = items?.[SETTINGS_KEY]?.noteColor;
        resolve(typeof color === "string" ? (color as NoteColor) : "yellow");
      });
    });
  }

  chrome.runtime.onInstalled.addListener(() => {
    createMenus();
  });

  chrome.runtime.onStartup?.addListener(() => {
    createMenus();
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) {
      return;
    }

    try {
      if (info.menuItemId === `${MENU_ROOT}:clear`) {
        await sendMessageToTab(tab.id, { type: "CLEAR_HIGHLIGHTS" });
        return;
      }

      if (info.menuItemId === `${MENU_ROOT}:note`) {
        const noteColor = await getNoteColorSetting();
        await sendMessageToTab(tab.id, { type: "CREATE_NOTE", color: noteColor });
        return;
      }

      if (typeof info.menuItemId === "string" && info.menuItemId.startsWith(`${MENU_ROOT}:highlight:`)) {
        const color = info.menuItemId.split(":").pop();
        if (color === "custom") {
          const customColor = await getCustomColorSetting();
          await sendMessageToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: "custom", customColor });
          return;
        }

        await sendMessageToTab(tab.id, { type: "APPLY_HIGHLIGHT", color });
      }
    } catch (error) {
      console.error("PersistentHighlighter: context menu action failed", error);
    }
  });
}
