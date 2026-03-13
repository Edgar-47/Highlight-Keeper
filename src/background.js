(function bootstrapBackground() {
  const COLOR_OPTIONS = [
    { id: "yellow",  label: "Amarillo",   circle: "🟡" },
    { id: "green",   label: "Idea clave", circle: "🟢" },
    { id: "blue",    label: "Info",       circle: "🔵" },
    { id: "pink",    label: "Rosa",       circle: "🩷" },
    { id: "orange",  label: "Repasar",    circle: "🟠" },
    { id: "purple",  label: "Duda",       circle: "🟣" },
    { id: "teal",    label: "Turquesa",   circle: "🔹" },
    { id: "red",     label: "Importante", circle: "🔴" },
    { id: "gray",    label: "Gris",       circle: "⚪" }
  ];

  const MENU_ROOT   = "annotate";
  const SETTINGS_KEY = "annotate.settings";

  function createMenus() {
    chrome.contextMenus.removeAll(function() {
      chrome.contextMenus.create({
        id: MENU_ROOT,
        title: "Annotate",
        contexts: ["selection", "page"]
      });

      COLOR_OPTIONS.forEach(function(color) {
        chrome.contextMenus.create({
          id: MENU_ROOT + ":hl:" + color.id,
          parentId: MENU_ROOT,
          title: color.circle + " " + color.label,
          contexts: ["selection"]
        });
      });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":hl:custom",
        parentId: MENU_ROOT,
        title: "🎨 Último color personalizado",
        contexts: ["selection"]
      });

      chrome.contextMenus.create({ id: MENU_ROOT + ":sep1", parentId: MENU_ROOT, type: "separator", contexts: ["selection", "page"] });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":note-from-selection",
        parentId: MENU_ROOT,
        title: "📝 Crear nota con selección",
        contexts: ["selection"]
      });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":note",
        parentId: MENU_ROOT,
        title: "🗒️ Nueva nota post-it",
        contexts: ["page"]
      });

      chrome.contextMenus.create({ id: MENU_ROOT + ":sep2", parentId: MENU_ROOT, type: "separator", contexts: ["page"] });

      chrome.contextMenus.create({
        id: MENU_ROOT + ":clear",
        parentId: MENU_ROOT,
        title: "🗑️ Limpiar resaltados de esta página",
        contexts: ["page"]
      });
    });
  }

  // Inyecta CSS y scripts en la pestaña activa si no están ya cargados
  function injectIntoTab(tabId) {
    return new Promise(function(resolve, reject) {
      chrome.scripting.insertCSS({ target: { tabId }, files: ["src/styles.css"] }, function() {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ["src/types.js", "src/storage.js", "src/highlighter.js", "src/notes.js", "src/content.js"] },
          function() {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            resolve();
          }
        );
      });
    });
  }

  async function sendToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (_e) {
      await injectIntoTab(tabId);
      await chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function getSetting(key, fallback) {
    return new Promise(function(resolve) {
      chrome.storage.local.get([SETTINGS_KEY], function(items) {
        const s = items && items[SETTINGS_KEY];
        resolve(s && s[key] !== undefined ? s[key] : fallback);
      });
    });
  }

  chrome.runtime.onInstalled.addListener(createMenus);
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(createMenus);

  // ── Menú contextual ────────────────────────────────────────────────────────
  chrome.contextMenus.onClicked.addListener(async function(info, tab) {
    if (!tab || !tab.id) return;

    try {
      const mid = info.menuItemId;

      if (mid === MENU_ROOT + ":clear") {
        await sendToTab(tab.id, { type: "CLEAR_HIGHLIGHTS" });
        return;
      }

      if (mid === MENU_ROOT + ":note") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE", color: noteColor });
        return;
      }

      if (mid === MENU_ROOT + ":note-from-selection") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE_FROM_SELECTION", color: noteColor });
        return;
      }

      if (typeof mid === "string" && mid.startsWith(MENU_ROOT + ":hl:")) {
        const color = mid.split(":").pop();
        if (color === "custom") {
          const customColor = await getSetting("customColor", "#facc15");
          await sendToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: "custom", customColor });
        } else {
          await sendToTab(tab.id, { type: "APPLY_HIGHLIGHT", color });
        }
      }
    } catch (err) {
      console.error("Annotate: error en menú contextual", err);
    }
  });

  // ── Atajos de teclado (commands) ──────────────────────────────────────────
  chrome.commands.onCommand.addListener(async function(command) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    try {
      if (command === "highlight-selection") {
        const selectedColor = await getSetting("selectedColor", "yellow");
        const customColor   = await getSetting("customColor", "#facc15");
        await sendToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: selectedColor, customColor });
      }

      if (command === "create-note") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE", color: noteColor });
      }

      if (command === "highlight-from-selection") {
        const noteColor = await getSetting("noteColor", "yellow");
        await sendToTab(tab.id, { type: "CREATE_NOTE_FROM_SELECTION", color: noteColor });
      }
    } catch (err) {
      console.error("Annotate: error en atajo de teclado", err);
    }
  });
})();
