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

  // ── Colores extra de resaltado (sección "Más colores") ───────────────────
  ns.EXTRA_COLOR_OPTIONS = [
    // Amarillos / Dorados
    { id: "ex-lemon",      label: "Limón",        hex: "#fff176", group: "Amarillos" },
    { id: "ex-amber",      label: "Ámbar",         hex: "#fbbf24", group: "Amarillos" },
    { id: "ex-gold",       label: "Dorado",        hex: "#d97706", group: "Amarillos" },
    { id: "ex-butter",     label: "Mantequilla",   hex: "#fef08a", group: "Amarillos" },
    // Rosas / Rojos
    { id: "ex-rose",       label: "Rosa vivo",     hex: "#fb7185", group: "Rosas" },
    { id: "ex-fuchsia",    label: "Fucsia",        hex: "#e879f9", group: "Rosas" },
    { id: "ex-hotpink",    label: "Rosa fuerte",   hex: "#f43f5e", group: "Rosas" },
    { id: "ex-salmon",     label: "Salmón",        hex: "#fca5a5", group: "Rosas" },
    { id: "ex-crimson",    label: "Carmesí",       hex: "#dc2626", group: "Rosas" },
    { id: "ex-coral",      label: "Coral",         hex: "#ff6b6b", group: "Rosas" },
    // Naranjas
    { id: "ex-peach",      label: "Melocotón",     hex: "#fdba74", group: "Naranjas" },
    { id: "ex-tangerine",  label: "Mandarina",     hex: "#f97316", group: "Naranjas" },
    { id: "ex-pumpkin",    label: "Calabaza",      hex: "#ea580c", group: "Naranjas" },
    { id: "ex-apricot",    label: "Albaricoque",   hex: "#fb923c", group: "Naranjas" },
    // Verdes
    { id: "ex-lime",       label: "Lima",          hex: "#a3e635", group: "Verdes" },
    { id: "ex-mint",       label: "Menta",         hex: "#6ee7b7", group: "Verdes" },
    { id: "ex-emerald",    label: "Esmeralda",     hex: "#10b981", group: "Verdes" },
    { id: "ex-forest",     label: "Bosque",        hex: "#16a34a", group: "Verdes" },
    { id: "ex-olive",      label: "Oliva",         hex: "#84cc16", group: "Verdes" },
    { id: "ex-sage",       label: "Salvia",        hex: "#86efac", group: "Verdes" },
    { id: "ex-grass",      label: "Hierba",        hex: "#4ade80", group: "Verdes" },
    // Azules
    { id: "ex-sky",        label: "Cielo",         hex: "#38bdf8", group: "Azules" },
    { id: "ex-azure",      label: "Azul vivo",     hex: "#3b82f6", group: "Azules" },
    { id: "ex-indigo",     label: "Índigo",        hex: "#6366f1", group: "Azules" },
    { id: "ex-navy",       label: "Marino",        hex: "#1e40af", group: "Azules" },
    { id: "ex-cerulean",   label: "Cerúleo",       hex: "#0ea5e9", group: "Azules" },
    { id: "ex-cobalt",     label: "Cobalto",       hex: "#2563eb", group: "Azules" },
    { id: "ex-ice",        label: "Hielo",         hex: "#bae6fd", group: "Azules" },
    // Morados
    { id: "ex-violet",     label: "Violeta",       hex: "#8b5cf6", group: "Morados" },
    { id: "ex-lavender",   label: "Lavanda",       hex: "#c4b5fd", group: "Morados" },
    { id: "ex-plum",       label: "Ciruela",       hex: "#7c3aed", group: "Morados" },
    { id: "ex-grape",      label: "Uva",           hex: "#9333ea", group: "Morados" },
    { id: "ex-lilac",      label: "Lila",          hex: "#d8b4fe", group: "Morados" },
    // Neutros / Especiales
    { id: "ex-slate",      label: "Pizarra",       hex: "#64748b", group: "Neutros" },
    { id: "ex-stone",      label: "Piedra",        hex: "#a8a29e", group: "Neutros" },
    { id: "ex-brown",      label: "Marrón",        hex: "#92400e", group: "Neutros" },
    { id: "ex-tan",        label: "Tostado",       hex: "#d4a574", group: "Neutros" },
    { id: "ex-white",      label: "Blanco",        hex: "#f8f8f8", group: "Neutros" },
    { id: "ex-charcoal",   label: "Carbón",        hex: "#374151", group: "Neutros" },
    // Neón / Especiales
    { id: "ex-neon-green", label: "Neón verde",    hex: "#39ff14", group: "Neón" },
    { id: "ex-neon-pink",  label: "Neón rosa",     hex: "#ff10f0", group: "Neón" },
    { id: "ex-neon-blue",  label: "Neón azul",     hex: "#00d4ff", group: "Neón" },
    { id: "ex-neon-yellow",label: "Neón amarillo", hex: "#ffff00", group: "Neón" }
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
