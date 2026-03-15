(function bootstrapTypes(global) {
  const ns = global.PersistentHighlighter || (global.PersistentHighlighter = {});

  // ── Claves de almacenamiento ──────────────────────────────────────────────
  ns.STORAGE_KEY        = "annotate.recordsByUrl";
  ns.NOTES_STORAGE_KEY  = "annotate.notesByUrl";
  ns.SETTINGS_KEY       = "annotate.settings";
  ns.FOCUS_STORAGE_KEY  = "annotate.focusState";
  ns.HIGHLIGHT_CLASS    = "ph-highlight";
  ns.HIGHLIGHT_ATTR     = "data-ph-id";
  ns.DYNAMIC_RESTORE_DELAY_MS = 700;
  ns.DEFAULT_COLOR      = "yellow";
  ns.PDF_VIEWER_PATH    = "src/pdf-viewer.html";
  ns.CHROME_PDF_VIEWER_HOST = "mhjfbmdgcfjbbpaeojofohoefgiehjai";

  // ── Colores de resaltado ──────────────────────────────────────────────────
  ns.COLOR_OPTIONS = [
    { id: "yellow",  label: "Amarillo",  circle: "", category: "general"   },
    { id: "green",   label: "Idea clave",circle: "", category: "idea"      },
    { id: "blue",    label: "Info",      circle: "", category: "info"      },
    { id: "pink",    label: "Rosa",      circle: "", category: "general"   },
    { id: "orange",  label: "Repasar",   circle: "", category: "review"    },
    { id: "purple",  label: "Duda",      circle: "", category: "question"  },
    { id: "teal",    label: "Turquesa",  circle: "", category: "general"   },
    { id: "red",     label: "Importante",circle: "", category: "important" },
    { id: "gray",    label: "Gris",      circle: "", category: "general"   }
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

  ns.isAnnotatePdfViewerUrl = function isAnnotatePdfViewerUrl(rawUrl) {
    if (!rawUrl || !global.chrome || !chrome.runtime || !chrome.runtime.getURL) return false;
    return String(rawUrl).startsWith(chrome.runtime.getURL(ns.PDF_VIEWER_PATH));
  };

  ns.isChromePdfViewerUrl = function isChromePdfViewerUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "chrome-extension:" &&
        url.host === ns.CHROME_PDF_VIEWER_HOST &&
        /\/index\.html$/i.test(url.pathname) &&
        Boolean(url.searchParams.get("src"));
    } catch (_e) {
      return false;
    }
  };

  ns.extractPdfUrl = function extractPdfUrl(rawUrl) {
    if (!rawUrl) return null;

    try {
      const url = new URL(rawUrl);
      if (ns.isAnnotatePdfViewerUrl(rawUrl) || ns.isChromePdfViewerUrl(rawUrl)) {
        const embedded = url.searchParams.get("src");
        return embedded ? ns.normalizeUrl(embedded) : null;
      }

      const normalizedHref = ns.normalizeUrl(rawUrl);
      const pathname = decodeURIComponent(url.pathname || "").toLowerCase();
      if (pathname.endsWith(".pdf") || /\.pdf(?:$|[?#])/i.test(normalizedHref)) {
        return normalizedHref;
      }
    } catch (_e) {
      if (/\.pdf(?:$|[?#])/i.test(String(rawUrl))) {
        return ns.normalizeUrl(rawUrl);
      }
    }

    return null;
  };

  ns.getDocumentUrl = function getDocumentUrl() {
    if (typeof global.__annotateDocumentUrl === "string" && global.__annotateDocumentUrl.trim()) {
      return ns.normalizeUrl(global.__annotateDocumentUrl);
    }

    return ns.extractPdfUrl(global.location && global.location.href) ||
      ns.normalizeUrl((global.location && global.location.href) || "");
  };

  ns.getAnnotatePdfViewerUrl = function getAnnotatePdfViewerUrl(rawPdfUrl) {
    const viewerUrl = chrome.runtime.getURL(ns.PDF_VIEWER_PATH);
    const url = new URL(viewerUrl);
    url.searchParams.set("src", ns.normalizeUrl(rawPdfUrl));
    return url.toString();
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

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(Math.max(numeric, min), max);
  }

  function normalizeInteger(value, min, max, fallback) {
    return Math.round(clampNumber(value, min, max, fallback));
  }

  function normalizeMs(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return fallback;
    return Math.round(numeric);
  }

  function normalizeTimestamp(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
  }

  function normalizeMode(value) {
    const mode = String(value || "");
    return ["clock", "stopwatch", "countdown", "breakCycle", "study"].includes(mode) ? mode : "clock";
  }

  function normalizeLayout(value) {
    const layout = String(value || "");
    return ["stacked", "split", "minimal"].includes(layout) ? layout : "stacked";
  }

  function normalizePhase(value) {
    const phase = String(value || "");
    return ["focus", "break", "longBreak"].includes(phase) ? phase : "focus";
  }

  function getCountdownDefaults() {
    return {
      durationMinutes: 25,
      remainingMs: 25 * 60 * 1000,
      endsAt: null,
      isRunning: false
    };
  }

  function getCycleDefaults(kind) {
    if (kind === "breakCycle") {
      return {
        focusMinutes: 52,
        breakMinutes: 17,
        longBreakMinutes: 30,
        rounds: 4,
        currentRound: 1,
        phase: "focus",
        remainingMs: 52 * 60 * 1000,
        endsAt: null,
        isRunning: false
      };
    }

    return {
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      rounds: 4,
      currentRound: 1,
      phase: "focus",
      remainingMs: 25 * 60 * 1000,
      endsAt: null,
      isRunning: false
    };
  }

  function normalizeCountdown(raw) {
    const defaults = getCountdownDefaults();
    const durationMinutes = normalizeInteger(raw && raw.durationMinutes, 1, 600, defaults.durationMinutes);
    const fallbackRemaining = durationMinutes * 60 * 1000;
    return {
      durationMinutes: durationMinutes,
      remainingMs: normalizeMs(raw && raw.remainingMs, fallbackRemaining),
      endsAt: normalizeTimestamp(raw && raw.endsAt),
      isRunning: Boolean(raw && raw.isRunning)
    };
  }

  function normalizeCycle(raw, kind) {
    const defaults = getCycleDefaults(kind);
    const focusMinutes = normalizeInteger(raw && raw.focusMinutes, 1, 600, defaults.focusMinutes);
    const breakMinutes = normalizeInteger(raw && raw.breakMinutes, 1, 180, defaults.breakMinutes);
    const longBreakMinutes = normalizeInteger(raw && raw.longBreakMinutes, 1, 240, defaults.longBreakMinutes);
    const rounds = normalizeInteger(raw && raw.rounds, 1, 12, defaults.rounds);
    return {
      focusMinutes: focusMinutes,
      breakMinutes: breakMinutes,
      longBreakMinutes: longBreakMinutes,
      rounds: rounds,
      currentRound: normalizeInteger(raw && raw.currentRound, 1, rounds, defaults.currentRound),
      phase: normalizePhase(raw && raw.phase),
      remainingMs: normalizeMs(raw && raw.remainingMs, focusMinutes * 60 * 1000),
      endsAt: normalizeTimestamp(raw && raw.endsAt),
      isRunning: Boolean(raw && raw.isRunning)
    };
  }

  ns.getDefaultFocusState = function getDefaultFocusState() {
    return {
      visible: false,
      mode: "clock",
      layout: "stacked",
      use24Hour: true,
      showSeconds: true,
      x: 24,
      y: 24,
      countdown: getCountdownDefaults(),
      stopwatch: {
        elapsedMs: 0,
        startedAt: null,
        isRunning: false
      },
      breakCycle: getCycleDefaults("breakCycle"),
      study: getCycleDefaults("study")
    };
  };

  ns.normalizeFocusState = function normalizeFocusState(raw) {
    const defaults = ns.getDefaultFocusState();
    const source = raw || {};

    return {
      visible: Boolean(source.visible),
      mode: normalizeMode(source.mode),
      layout: normalizeLayout(source.layout),
      use24Hour: source.use24Hour !== false,
      showSeconds: source.showSeconds !== false,
      x: normalizeInteger(source.x, 8, 100000, defaults.x),
      y: normalizeInteger(source.y, 8, 100000, defaults.y),
      countdown: normalizeCountdown(source.countdown),
      stopwatch: {
        elapsedMs: normalizeMs(source.stopwatch && source.stopwatch.elapsedMs, 0),
        startedAt: normalizeTimestamp(source.stopwatch && source.stopwatch.startedAt),
        isRunning: Boolean(source.stopwatch && source.stopwatch.isRunning)
      },
      breakCycle: normalizeCycle(source.breakCycle, "breakCycle"),
      study: normalizeCycle(source.study, "study")
    };
  };

  ns.mergeFocusState = function mergeFocusState(base, patch) {
    const current = ns.normalizeFocusState(base);
    const nextPatch = patch || {};
    return ns.normalizeFocusState({
      visible: nextPatch.visible !== undefined ? nextPatch.visible : current.visible,
      mode: nextPatch.mode || current.mode,
      layout: nextPatch.layout || current.layout,
      use24Hour: nextPatch.use24Hour !== undefined ? nextPatch.use24Hour : current.use24Hour,
      showSeconds: nextPatch.showSeconds !== undefined ? nextPatch.showSeconds : current.showSeconds,
      x: nextPatch.x !== undefined ? nextPatch.x : current.x,
      y: nextPatch.y !== undefined ? nextPatch.y : current.y,
      countdown: Object.assign({}, current.countdown, nextPatch.countdown || {}),
      stopwatch: Object.assign({}, current.stopwatch, nextPatch.stopwatch || {}),
      breakCycle: Object.assign({}, current.breakCycle, nextPatch.breakCycle || {}),
      study: Object.assign({}, current.study, nextPatch.study || {})
    });
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
