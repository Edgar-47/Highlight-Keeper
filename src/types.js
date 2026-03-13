(function bootstrapTypes(global) {
  const ns = global.PersistentHighlighter || (global.PersistentHighlighter = {});

  // ── Claves de almacenamiento ──────────────────────────────────────────────
  ns.STORAGE_KEY        = "annotate.recordsByUrl";
  ns.NOTES_STORAGE_KEY  = "annotate.notesByUrl";
  ns.SETTINGS_KEY       = "annotate.settings";
  ns.HIGHLIGHT_CLASS    = "ph-highlight";
  ns.HIGHLIGHT_ATTR     = "data-ph-id";
  ns.DYNAMIC_RESTORE_DELAY_MS = 700;
  ns.DEFAULT_COLOR      = "yellow";

  // ── Colores de resaltado ──────────────────────────────────────────────────
  ns.COLOR_OPTIONS = [
    { id: "yellow",  label: "Amarillo",  circle: "🟡", category: "general"   },
    { id: "green",   label: "Idea clave",circle: "🟢", category: "idea"      },
    { id: "blue",    label: "Info",      circle: "🔵", category: "info"      },
    { id: "pink",    label: "Rosa",      circle: "🩷", category: "general"   },
    { id: "orange",  label: "Repasar",   circle: "🟠", category: "review"    },
    { id: "purple",  label: "Duda",      circle: "🟣", category: "question"  },
    { id: "teal",    label: "Turquesa",  circle: "🔹", category: "general"   },
    { id: "red",     label: "Importante",circle: "🔴", category: "important" },
    { id: "gray",    label: "Gris",      circle: "⚪", category: "general"   }
  ];

  // ── Colores de notas ──────────────────────────────────────────────────────
  ns.NOTE_COLOR_OPTIONS = [
    { id: "yellow", label: "Amarillo" },
    { id: "pink",   label: "Rosa"     },
    { id: "blue",   label: "Azul"     },
    { id: "green",  label: "Verde"    },
    { id: "orange", label: "Naranja"  },
    { id: "purple", label: "Morado"   }
  ];

  // ── Categorías de resaltado ───────────────────────────────────────────────
  ns.HIGHLIGHT_CATEGORIES = [
    { id: "general",   label: "General",    icon: "◆" },
    { id: "idea",      label: "Idea clave", icon: "💡" },
    { id: "important", label: "Importante", icon: "⚡" },
    { id: "review",    label: "Repasar",    icon: "🔁" },
    { id: "question",  label: "Duda",       icon: "❓" },
    { id: "info",      label: "Info",       icon: "ℹ️"  }
  ];

  // ── Utilidades de URL ─────────────────────────────────────────────────────
  ns.normalizeUrl = function normalizeUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return url.toString();
    } catch (_e) {
      return String(rawUrl || "").split("#")[0];
    }
  };

  ns.getDomain = function getDomain(rawUrl) {
    try { return new URL(rawUrl).hostname; } catch (_e) { return rawUrl; }
  };

  // ── Utilidades de texto ───────────────────────────────────────────────────
  ns.normalizeText = function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  };

  ns.escapeHtml = function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  // ── Generadores de ID ─────────────────────────────────────────────────────
  ns.createId     = () => "hl_"   + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  ns.createNoteId = () => "note_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);

  // ── Firma de resaltado ────────────────────────────────────────────────────
  ns.buildSignature = function buildSignature(selectedText, prefix, suffix, domHint) {
    return [
      ns.normalizeText(selectedText).toLowerCase(),
      ns.normalizeText(prefix).toLowerCase(),
      ns.normalizeText(suffix).toLowerCase(),
      String(domHint || "").toLowerCase()
    ].join("::");
  };

  // ── Color hexadecimal seguro ──────────────────────────────────────────────
  ns.sanitizeColorHex = function sanitizeColorHex(rawColor) {
    const v = String(rawColor || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : "#facc15";
  };

  // ── Formato de fecha legible ──────────────────────────────────────────────
  ns.formatDate = function formatDate(isoString) {
    try {
      return new Date(isoString).toLocaleString("es-ES", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (_e) { return isoString; }
  };

  // ── Truncar texto ─────────────────────────────────────────────────────────
  ns.truncate = function truncate(text, max) {
    const t = String(text || "");
    return t.length <= max ? t : t.slice(0, max) + "…";
  };
})(globalThis);
