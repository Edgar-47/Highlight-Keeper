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

  // Colores extra (definidos en types.js, duplicamos los hex aquí para el background)
  const EXTRA_COLOR_HEX = {
    "ex-lemon":"#fff176","ex-amber":"#fbbf24","ex-gold":"#d97706","ex-butter":"#fef08a",
    "ex-rose":"#fb7185","ex-fuchsia":"#e879f9","ex-hotpink":"#f43f5e","ex-salmon":"#fca5a5",
    "ex-crimson":"#dc2626","ex-coral":"#ff6b6b","ex-peach":"#fdba74","ex-tangerine":"#f97316",
    "ex-pumpkin":"#ea580c","ex-apricot":"#fb923c","ex-lime":"#a3e635","ex-mint":"#6ee7b7",
    "ex-emerald":"#10b981","ex-forest":"#16a34a","ex-olive":"#84cc16","ex-sage":"#86efac",
    "ex-grass":"#4ade80","ex-sky":"#38bdf8","ex-azure":"#3b82f6","ex-indigo":"#6366f1",
    "ex-navy":"#1e40af","ex-cerulean":"#0ea5e9","ex-cobalt":"#2563eb","ex-ice":"#bae6fd",
    "ex-violet":"#8b5cf6","ex-lavender":"#c4b5fd","ex-plum":"#7c3aed","ex-grape":"#9333ea",
    "ex-lilac":"#d8b4fe","ex-slate":"#64748b","ex-stone":"#a8a29e","ex-brown":"#92400e",
    "ex-tan":"#d4a574","ex-white":"#f8f8f8","ex-charcoal":"#374151",
    "ex-neon-green":"#39ff14","ex-neon-pink":"#ff10f0","ex-neon-blue":"#00d4ff","ex-neon-yellow":"#ffff00"
  };

  function resolveColor(selectedColor, customColor) {
    if (selectedColor && selectedColor.startsWith("ex-")) {
      return { color: "custom", customColor: EXTRA_COLOR_HEX[selectedColor] || "#facc15" };
    }
    return { color: selectedColor, customColor };
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
        const resolved = resolveColor(selectedColor, customColor);
        await sendToTab(tab.id, { type: "APPLY_HIGHLIGHT", color: resolved.color, customColor: resolved.customColor });
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
