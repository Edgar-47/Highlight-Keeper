/// <reference path="./types.ts" />

namespace PersistentHighlighterBackground {
  const COLOR_OPTIONS = [
    { id: "yellow", label: "Yellow" },
    { id: "green", label: "Green" },
    { id: "blue", label: "Blue" },
    { id: "pink", label: "Pink" },
    { id: "orange", label: "Orange" }
  ] as const;

  const MENU_ROOT = "persistent-highlighter";

  function createMenus(): void {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ROOT,
        title: "Persistent Highlighter",
        contexts: ["selection", "page"]
      });

      for (const color of COLOR_OPTIONS) {
        chrome.contextMenus.create({
          id: `${MENU_ROOT}:highlight:${color.id}`,
          parentId: MENU_ROOT,
          title: `Highlight in ${color.label}`,
          contexts: ["selection"]
        });
      }

      chrome.contextMenus.create({
        id: `${MENU_ROOT}:clear`,
        parentId: MENU_ROOT,
        title: "Clear highlights on this page",
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

  async function sendMessageToTab(tabId: number, message: unknown): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (_error) {
      await injectIntoTab(tabId);
      await chrome.tabs.sendMessage(tabId, message);
    }
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

      if (typeof info.menuItemId === "string" && info.menuItemId.startsWith(`${MENU_ROOT}:highlight:`)) {
        const color = info.menuItemId.split(":").pop();
        await sendMessageToTab(tab.id, { type: "APPLY_HIGHLIGHT", color });
      }
    } catch (error) {
      console.error("PersistentHighlighter: context menu action failed", error);
    }
  });
}
