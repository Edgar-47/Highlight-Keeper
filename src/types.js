(function bootstrapTypes(global) {
  const namespace = global.PersistentHighlighter || (global.PersistentHighlighter = {});

  namespace.STORAGE_KEY = "persistent-highlighter.recordsByUrl";
  namespace.SETTINGS_KEY = "persistent-highlighter.settings";
  namespace.HIGHLIGHT_CLASS = "ph-highlight";
  namespace.HIGHLIGHT_ATTR = "data-ph-id";
  namespace.DYNAMIC_RESTORE_DELAY_MS = 700;
  namespace.DEFAULT_COLOR = "yellow";
  namespace.COLOR_OPTIONS = [
    { id: "yellow", label: "Sun" },
    { id: "green", label: "Mint" },
    { id: "blue", label: "Sky" },
    { id: "pink", label: "Rose" },
    { id: "orange", label: "Amber" }
  ];

  namespace.normalizeUrl = function normalizeUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return url.toString();
    } catch (_error) {
      return String(rawUrl || "").split("#")[0];
    }
  };

  namespace.normalizeText = function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  };

  namespace.createId = function createId() {
    return "hl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  };

  namespace.buildSignature = function buildSignature(selectedText, prefix, suffix, domHint) {
    return [
      namespace.normalizeText(selectedText).toLowerCase(),
      namespace.normalizeText(prefix).toLowerCase(),
      namespace.normalizeText(suffix).toLowerCase(),
      String(domHint || "").toLowerCase()
    ].join("::");
  };
})(globalThis);
