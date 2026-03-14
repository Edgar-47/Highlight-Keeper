(function bootstrapSidebar(global) {
  "use strict";
  const ns = global.PersistentHighlighter;
  if (!ns) return;
  if (global.__annotateSidebarLoaded) return;
  global.__annotateSidebarLoaded = true;

  let sidebarEl = null;
  let isOpen    = false;
  let storage   = null;

  function getStorage() {
    if (!storage) storage = new ns.HighlightStorage();
    return storage;
  }

  // ── SVG icons ──────────────────────────────────────────────────────────────
  const SVG = {
    search:   '<svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l3 3"/></svg>',
    close:    '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    export:   '<svg viewBox="0 0 16 16"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 12h10"/></svg>',
    tag:      '<svg viewBox="0 0 16 16"><path d="M2 8.5L7.5 3h5.5v5.5L7.5 14 2 8.5z"/><circle cx="11" cy="5" r="1" fill="currentColor"/></svg>',
    star:     '<svg viewBox="0 0 16 16"><path d="M8 2l1.5 4H14l-3.5 2.5 1.5 4L8 10l-4 2.5 1.5-4L2 6h4.5z"/></svg>',
    trash:    '<svg viewBox="0 0 16 16"><path d="M3 5h10M6 5V3h4v2M6 8v4M10 8v4M4 5l1 8h6l1-8"/></svg>',
    eye:      '<svg viewBox="0 0 16 16"><ellipse cx="8" cy="8" rx="6" ry="3.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>',
    copy:     '<svg viewBox="0 0 16 16"><rect x="6" y="4" width="7" height="9" rx="1.5"/><path d="M3 3v8h2"/></svg>',
    play:     '<svg viewBox="0 0 16 16"><path d="M5 3l8 5-8 5V3z" fill="currentColor" stroke="none"/></svg>',
    stop:     '<svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>',
    prev:     '<svg viewBox="0 0 16 16"><path d="M10 4L6 8l4 4"/></svg>',
    next:     '<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>',
    flip:     '<svg viewBox="0 0 16 16"><path d="M2 8h12M10 5l3 3-3 3"/></svg>',
    sort:     '<svg viewBox="0 0 16 16"><path d="M2 4h12M4 8h8M6 12h4"/></svg>',
    highlight:'<svg viewBox="0 0 16 16"><rect x="3" y="5" width="10" height="4" rx="1"/><path d="M5 12h6"/></svg>',
    note:     '<svg viewBox="0 0 16 16"><rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M6 6h4M6 9h3"/></svg>',
    organize: '<svg viewBox="0 0 16 16"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><path d="M6 4h4M4 6v4M12 6v2a2 2 0 01-2 2H6"/></svg>',
    study:    '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="8" rx="1.5"/><path d="M6 4V3M10 4V3"/></svg>',
    markdown: '<svg viewBox="0 0 16 16"><path d="M2 5h12v6H2z" rx="1"/><path d="M5 10V7l2 2 2-2v3M12 10V8.5l-1.5-1.5"/></svg>',
    text:     '<svg viewBox="0 0 16 16"><path d="M3 4h10M8 4v8M5 12h6"/></svg>',
    json:     '<svg viewBox="0 0 16 16"><path d="M6 4C4.5 4 4 5 4 6v1c0 1-.5 1.5-1 1.5.5 0 1 .5 1 1.5v1c0 1 .5 2 2 2M10 4c1.5 0 2 1 2 2v1c0 1 .5 1.5 1 1.5-.5 0-1 .5-1 1.5v1c0 1-.5 2-2 2"/></svg>',
    world:    '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5C9.5 4 10 6 10 8s-.5 4-2 5.5M8 2.5C6.5 4 6 6 6 8s.5 4 2 5.5M2.5 8h11"/></svg>',
    check:    '<svg viewBox="0 0 16 16"><path d="M3 8l3.5 3.5L13 5"/></svg>',
  };

  function icon(name, cls) {
    return '<span class="' + (cls || "ann-sb__hbtn-icon") + '">' + (SVG[name] || "") + '</span>';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function trunc(s, n) { s = String(s||""); return s.length<=n ? s : s.slice(0,n)+"…"; }
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString("es-ES", {
        day:"2-digit", month:"short", year:"numeric",
        hour:"2-digit", minute:"2-digit"
      });
    } catch(_) { return iso; }
  }

  // Color bar class for a record
  function colorBarCls(record) {
    if (record.customColor) return "";
    return "ann-sb__color-bar--" + record.color;
  }
  function colorBarStyle(record) {
    return record.customColor ? ' style="background:' + record.customColor + '"' : "";
  }

  // ── Build sidebar DOM ─────────────────────────────────────────────────────
  function buildSidebar() {
    if (sidebarEl) return;

    const el = document.createElement("div");
    el.id = "ann-sidebar";
    el.className = "ann-sidebar ann-sidebar--closed";
    el.setAttribute("role", "complementary");

    el.innerHTML = `
      <!-- HEADER -->
      <div class="ann-sb__header">
        <div class="ann-sb__brand">
          <span class="ann-sb__wordmark">Annotate</span>
          <span class="ann-sb__page-pill" id="ann-sb-page-pill">
            <span class="ann-sb__page-dot"></span>
            <span id="ann-sb-domain">—</span>
          </span>
        </div>
        <div class="ann-sb__header-btns">
          <button class="ann-sb__hbtn" id="ann-sb-export-btn" title="Exportar">${SVG.export}</button>
          <button class="ann-sb__hbtn" id="ann-sb-close" title="Cerrar panel">${SVG.close}</button>
        </div>
      </div>

      <!-- NAV TABS -->
      <nav class="ann-sb__nav" role="tablist">
        <button class="ann-sb__navbtn is-active" data-tab="sb-highlights" role="tab">
          ${SVG.highlight} Resaltados <span class="ann-sb__count" id="ann-sb-hl-n">0</span>
        </button>
        <button class="ann-sb__navbtn" data-tab="sb-notes" role="tab">
          ${SVG.note} Notas <span class="ann-sb__count" id="ann-sb-note-n">0</span>
        </button>
        <button class="ann-sb__navbtn" data-tab="sb-organize" role="tab">
          ${SVG.tag} Etiquetas
        </button>
        <button class="ann-sb__navbtn" data-tab="sb-study" role="tab">
          ${SVG.study} Estudio
        </button>
      </nav>

      <!-- ════ PANEL: HIGHLIGHTS ════ -->
      <div id="sb-highlights" class="ann-sb__panel is-active" role="tabpanel">
        <div class="ann-sb__toolbar">
          <div class="ann-sb__searchbox">
            ${SVG.search}
            <input id="ann-sb-search" class="ann-sb__searchinput" type="search"
              placeholder="Buscar resaltados…" autocomplete="off" />
          </div>
          <button class="ann-sb__toolbar-btn" id="ann-sb-sort-btn" title="Ordenar">
            ${SVG.sort} Orden
          </button>
        </div>
        <div id="ann-sb-filters" class="ann-sb__filters"></div>
        <div id="ann-sb-hl-list" class="ann-sb__list"></div>
        <div class="ann-sb__actions">
          <button class="ann-sb__abtn" id="ann-sb-copy-btn">${SVG.copy} Copiar todo</button>
          <button class="ann-sb__abtn" id="ann-sb-export-md-btn">${SVG.markdown} Markdown</button>
          <button class="ann-sb__abtn" id="ann-sb-export-txt-btn">${SVG.text} TXT</button>
        </div>
      </div>

      <!-- ════ PANEL: NOTES ════ -->
      <div id="sb-notes" class="ann-sb__panel" role="tabpanel" hidden>
        <div id="ann-sb-note-list" class="ann-sb__list"></div>
      </div>

      <!-- ════ PANEL: ORGANIZE ════ -->
      <div id="sb-organize" class="ann-sb__panel" role="tabpanel" hidden>
        <div class="ann-sb__org-header">
          <p class="ann-sb__org-label">Etiquetas globales</p>
          <div class="ann-sb__tag-input-row">
            <input id="ann-sb-tag-input" class="ann-sb__taginput"
              type="text" placeholder="Nueva etiqueta… ej. IA, tesis, trabajo" maxlength="32" />
            <button class="ann-sb__abtn ann-sb__abtn--primary" id="ann-sb-tag-add">Añadir</button>
          </div>
          <div id="ann-sb-tagcloud" class="ann-sb__tagcloud"></div>
        </div>
        <div class="ann-sb__toolbar" style="padding-top:10px">
          <div class="ann-sb__searchbox">
            ${SVG.search}
            <input id="ann-sb-org-search" class="ann-sb__searchinput" type="search"
              placeholder="Buscar en resaltados…" autocomplete="off" />
          </div>
        </div>
        <div id="ann-sb-org-filters" class="ann-sb__filters"></div>
        <div id="ann-sb-org-list" class="ann-sb__list"></div>
      </div>

      <!-- ════ PANEL: STUDY ════ -->
      <div id="sb-study" class="ann-sb__panel" role="tabpanel" hidden>
        <div class="ann-sb__study-cfg" id="ann-sb-study-cfg">
          <p class="ann-sb__study-title">Modo estudio — Flashcards</p>

          <div class="ann-sb__field">
            <label class="ann-sb__field-label" for="ann-sb-fc-color">Filtrar por color</label>
            <select id="ann-sb-fc-color" class="ann-sb__select">
              <option value="all">Todos los colores</option>
              <option value="green">Idea clave</option>
              <option value="blue">Info</option>
              <option value="purple">Duda</option>
              <option value="orange">Repasar</option>
              <option value="red">Importante</option>
              <option value="yellow">Amarillo</option>
            </select>
          </div>

          <div class="ann-sb__field">
            <label class="ann-sb__field-label" for="ann-sb-fc-mode">Modo de repaso</label>
            <select id="ann-sb-fc-mode" class="ann-sb__select">
              <option value="recall">Recordar — texto oculto</option>
              <option value="qa">Pregunta / Respuesta — usa el comentario</option>
            </select>
          </div>

          <button class="ann-sb__start-btn" id="ann-sb-start-fc">
            ${SVG.play} Empezar sesión
          </button>
          <p class="ann-sb__fc-status" id="ann-sb-fc-status"></p>

          <div class="ann-sb__study-hint">
            <strong>Consejo:</strong> Marca con color <em>Duda</em> los conceptos difíciles.
            Si añades un comentario al resaltado, puedes usarlo como pregunta en el
            modo Pregunta / Respuesta.
          </div>
        </div>

        <!-- Active session -->
        <div id="ann-sb-fc-session" class="ann-sb__fc-session" hidden>
          <div class="ann-sb__fc-progress">
            <span class="ann-sb__fc-counter" id="ann-sb-fc-counter">1 / 1</span>
            <div class="ann-sb__fc-track">
              <div class="ann-sb__fc-fill" id="ann-sb-fc-fill" style="width:0%"></div>
            </div>
          </div>

          <div class="ann-sb__fc-card ann-sb__fc-card--anim" id="ann-sb-fc-card">
            <div class="ann-sb__fc-card-face" id="ann-sb-fc-front">
              <span class="ann-sb__fc-face-label" id="ann-sb-fc-front-label">Fragmento</span>
              <p class="ann-sb__fc-face-text" id="ann-sb-fc-front-text"></p>
            </div>
            <div class="ann-sb__fc-divider" id="ann-sb-fc-divider" hidden></div>
            <div class="ann-sb__fc-card-face" id="ann-sb-fc-back" hidden>
              <span class="ann-sb__fc-face-label">Respuesta completa</span>
              <p class="ann-sb__fc-face-text" id="ann-sb-fc-back-text"></p>
            </div>
            <div class="ann-sb__fc-card-footer">
              <span class="ann-sb__fc-answer-label" id="ann-sb-fc-answer-label">Respuesta oculta</span>
              <button class="ann-sb__fc-reveal-btn" id="ann-sb-fc-reveal">
                ${SVG.eye} Revelar
              </button>
            </div>
          </div>

          <div class="ann-sb__fc-controls">
            <button class="ann-sb__fc-ctrl" id="ann-sb-fc-prev">${SVG.prev} Anterior</button>
            <button class="ann-sb__fc-ctrl ann-sb__fc-ctrl--primary" id="ann-sb-fc-flip">
              ${SVG.flip} Siguiente
            </button>
            <button class="ann-sb__fc-ctrl" id="ann-sb-fc-next">Siguiente ${SVG.next}</button>
          </div>
          <button class="ann-sb__fc-stop" id="ann-sb-fc-stop">Terminar sesión</button>
        </div>
      </div>

      <!-- TAG EDITOR OVERLAY -->
      <div id="ann-sb-overlay" class="ann-sb__overlay" hidden>
        <div class="ann-sb__overlay-card">
          <p class="ann-sb__overlay-title">Editar etiquetas</p>
          <p id="ann-sb-overlay-excerpt" class="ann-sb__overlay-excerpt"></p>
          <div>
            <p class="ann-sb__overlay-section">Etiquetas activas</p>
            <div id="ann-sb-overlay-tags" class="ann-sb__overlay-tags"></div>
          </div>
          <div>
            <p class="ann-sb__overlay-section">Añadir etiqueta</p>
            <div class="ann-sb__overlay-input-row">
              <input id="ann-sb-overlay-input" class="ann-sb__overlay-input"
                type="text" placeholder="Nombre de etiqueta…" maxlength="32" />
              <button class="ann-sb__overlay-add" id="ann-sb-overlay-add">Añadir</button>
            </div>
          </div>
          <div id="ann-sb-overlay-suggestions" style="display:flex;flex-wrap:wrap;gap:5px;min-height:0"></div>
          <div class="ann-sb__overlay-footer">
            <button class="ann-sb__overlay-close" id="ann-sb-overlay-close">Cerrar</button>
          </div>
        </div>
      </div>

      <!-- EXPORT DROPDOWN -->
      <div id="ann-sb-dropdown" class="ann-sb__dropdown" hidden>
        <p class="ann-sb__dropdown-section">Exportar página actual</p>
        <button class="ann-sb__dropdown-item ann-sb__dropdown-item--md" data-export="md">
          <span class="ann-sb__dropdown-item-icon">${SVG.markdown}</span>
          <span>
            <span class="ann-sb__dropdown-item-label">Markdown</span>
            <span class="ann-sb__dropdown-item-sub">.md — para Obsidian, Notion…</span>
          </span>
        </button>
        <button class="ann-sb__dropdown-item ann-sb__dropdown-item--txt" data-export="txt">
          <span class="ann-sb__dropdown-item-icon">${SVG.text}</span>
          <span>
            <span class="ann-sb__dropdown-item-label">Texto plano</span>
            <span class="ann-sb__dropdown-item-sub">.txt — legible en cualquier editor</span>
          </span>
        </button>
        <button class="ann-sb__dropdown-item ann-sb__dropdown-item--json" data-export="json">
          <span class="ann-sb__dropdown-item-icon">${SVG.json}</span>
          <span>
            <span class="ann-sb__dropdown-item-label">JSON</span>
            <span class="ann-sb__dropdown-item-sub">.json — para desarrolladores</span>
          </span>
        </button>
        <div class="ann-sb__dropdown-sep"></div>
        <p class="ann-sb__dropdown-section">Exportar todo</p>
        <button class="ann-sb__dropdown-item ann-sb__dropdown-item--all" data-export="all-md">
          <span class="ann-sb__dropdown-item-icon">${SVG.world}</span>
          <span>
            <span class="ann-sb__dropdown-item-label">Todas las páginas</span>
            <span class="ann-sb__dropdown-item-sub">.md — exportación completa</span>
          </span>
        </button>
        <div class="ann-sb__dropdown-sep"></div>
        <button class="ann-sb__dropdown-item ann-sb__dropdown-item--copy" data-export="copy">
          <span class="ann-sb__dropdown-item-icon">${SVG.copy}</span>
          <span>
            <span class="ann-sb__dropdown-item-label">Copiar al portapapeles</span>
            <span class="ann-sb__dropdown-item-sub">Texto de esta página</span>
          </span>
        </button>
      </div>
    `;

    document.documentElement.appendChild(el);
    sidebarEl = el;

    _bindEvents();
  }

  // ── Event binding ─────────────────────────────────────────────────────────
  function _bindEvents() {
    // Close
    _q("ann-sb-close").addEventListener("click", closeSidebar);

    // Tabs
    sidebarEl.querySelectorAll(".ann-sb__navbtn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        sidebarEl.querySelectorAll(".ann-sb__navbtn").forEach(function(b) {
          b.classList.remove("is-active");
          b.setAttribute("aria-selected", "false");
        });
        sidebarEl.querySelectorAll(".ann-sb__panel").forEach(function(p) {
          p.classList.remove("is-active");
          p.hidden = true;
        });
        btn.classList.add("is-active");
        btn.setAttribute("aria-selected", "true");
        var panel = document.getElementById(btn.dataset.tab);
        if (panel) { panel.classList.add("is-active"); panel.hidden = false; }
        if (btn.dataset.tab === "sb-organize") _refreshOrg();
      });
    });

    // Highlight search
    _q("ann-sb-search").addEventListener("input", function(e) {
      renderHighlights(e.target.value.trim());
    });

    // Sort toggle
    _sortAsc = true;
    _q("ann-sb-sort-btn").addEventListener("click", function() {
      _sortAsc = !_sortAsc;
      renderHighlights(_q("ann-sb-search").value.trim());
      this.title = _sortAsc ? "Orden ascendente" : "Orden descendente";
    });

    // Bottom actions in highlights panel
    _q("ann-sb-copy-btn").addEventListener("click", _copyAll);
    _q("ann-sb-export-md-btn").addEventListener("click", function() { _export("md"); });
    _q("ann-sb-export-txt-btn").addEventListener("click", function() { _export("txt"); });

    // Export dropdown
    _q("ann-sb-export-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      _toggleDropdown();
    });
    sidebarEl.querySelectorAll(".ann-sb__dropdown-item[data-export]").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        _closeDropdown();
        var fmt = btn.dataset.export;
        if (fmt === "copy") _copyAll();
        else if (fmt === "all-md") _exportAllMd();
        else _export(fmt);
      });
    });

    // Organize
    _q("ann-sb-tag-input").addEventListener("keydown", function(e) {
      if (e.key === "Enter") _q("ann-sb-tag-add").click();
    });
    _q("ann-sb-tag-add").addEventListener("click", async function() {
      var inp = _q("ann-sb-tag-input");
      var tag = inp.value.trim();
      if (!tag) return;
      inp.value = "";
      await _addGlobalTag(tag);
      await _refreshOrg();
    });
    _q("ann-sb-org-search").addEventListener("input", function(e) {
      _orgSearch = e.target.value.trim();
      _renderOrgList();
    });

    // Tag overlay
    _q("ann-sb-overlay-close").addEventListener("click", function() {
      _q("ann-sb-overlay").hidden = true;
    });
    _q("ann-sb-overlay-input").addEventListener("keydown", function(e) {
      if (e.key === "Enter") _q("ann-sb-overlay-add").click();
    });
    _q("ann-sb-overlay-add").addEventListener("click", async function() {
      var inp = _q("ann-sb-overlay-input");
      var tag = inp.value.trim();
      if (!tag || !_tagRecord) return;
      inp.value = "";
      await _addTagToRecord(_tagRecord, tag);
    });

    // Flashcards
    _initFlashcards();

    // Close dropdown on outside click
    document.addEventListener("click", function() { _closeDropdown(); });
  }

  function _q(id) { return document.getElementById(id); }

  // ═══════════════════════════════════════════════════════════
  // DATA
  // ═══════════════════════════════════════════════════════════

  var _highlights = [];
  var _notes      = [];
  var _hlFilter   = "all";
  var _sortAsc    = true;

  async function loadData() {
    var s = getStorage();
    _highlights = await s.getHighlights(window.location.href);
    _notes      = await s.getNotes(window.location.href);

    var domain = "";
    try { domain = new URL(window.location.href).hostname.replace(/^www\./, ""); } catch(_) {}
    var domEl = _q("ann-sb-domain");
    if (domEl) domEl.textContent = trunc(domain, 22) || "—";

    _updateCount("ann-sb-hl-n",   _highlights.length);
    _updateCount("ann-sb-note-n", _notes.length);

    _renderFilters();
    renderHighlights(_q("ann-sb-search") ? _q("ann-sb-search").value.trim() : "");
    _renderNotes(_notes);
  }

  function _updateCount(id, n) {
    var el = _q(id);
    if (el) el.textContent = n > 0 ? String(n) : "0";
  }

  // ═══════════════════════════════════════════════════════════
  // HIGHLIGHTS PANEL
  // ═══════════════════════════════════════════════════════════

  function _renderFilters() {
    var c = _q("ann-sb-filters");
    if (!c) return;
    c.innerHTML = "";

    function pill(id, label, dotColor) {
      var btn = document.createElement("button");
      btn.className = "ann-sb__fpill" + (_hlFilter === id ? " is-active" : "");
      btn.innerHTML = dotColor
        ? '<span class="ann-sb__fpill-dot" style="background:' + dotColor + '"></span>' + esc(label)
        : esc(label);
      btn.addEventListener("click", function() {
        _hlFilter = id;
        _renderFilters();
        renderHighlights(_q("ann-sb-search").value.trim());
      });
      c.appendChild(btn);
    }

    var COLOR_HEX = {
      yellow:"#facc15", green:"#4ade80", blue:"#60a5fa", pink:"#f472b6",
      orange:"#fb923c", purple:"#a78bfa", teal:"#2dd4bf", red:"#f87171", gray:"#a1a1aa"
    };

    pill("all", "Todos  " + _highlights.length, null);

    var colorCounts = {};
    _highlights.forEach(function(h) { colorCounts[h.color] = (colorCounts[h.color]||0)+1; });
    ns.COLOR_OPTIONS.forEach(function(c) {
      if (colorCounts[c.id]) pill(c.id, c.label + " " + colorCounts[c.id], COLOR_HEX[c.id]);
    });

    var favCount = _highlights.filter(function(h) { return h.isFavorite; }).length;
    if (favCount > 0) pill("favorites", "Favoritos " + favCount, null);
  }

  function renderHighlights(query) {
    var list = _q("ann-sb-hl-list");
    if (!list) return;

    var items = _highlights.slice();
    if (_hlFilter === "favorites") items = items.filter(function(h) { return h.isFavorite; });
    else if (_hlFilter !== "all")  items = items.filter(function(h) { return h.color === _hlFilter; });

    if (query) {
      var q = query.toLowerCase();
      items = items.filter(function(h) {
        return h.selectedText.toLowerCase().includes(q) ||
               (h.comment||"").toLowerCase().includes(q) ||
               (h.tags||[]).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }

    if (!_sortAsc) items = items.slice().reverse();

    if (!items.length) {
      list.innerHTML = _emptyState(
        SVG.highlight,
        query ? "Sin resultados" : (_hlFilter !== "all" ? "Ningún resaltado con este filtro" : "Sin resaltados en esta página"),
        query ? 'Prueba con otras palabras.' : 'Selecciona texto y usa el atajo Alt+H para empezar.'
      );
      return;
    }

    list.innerHTML = "";
    var COLOR_LABELS = {};
    ns.COLOR_OPTIONS.forEach(function(c) { COLOR_LABELS[c.id] = c.label; });

    items.forEach(function(record) {
      var row = document.createElement("div");
      row.className = "ann-sb__row";

      var tagsHtml = (record.tags||[]).map(function(t) {
        return '<span class="ann-sb__tag">' + esc(t) + '</span>';
      }).join("");

      var barClass = record.customColor ? "" : ("ann-sb__color-bar--" + record.color);
      var barStyle = record.customColor ? (' style="background:' + record.customColor + '"') : "";

      row.innerHTML =
        '<div class="ann-sb__color-bar ' + barClass + '"' + barStyle + '></div>' +
        '<div class="ann-sb__row-body">' +
          '<p class="ann-sb__row-text" title="Ir al resaltado">' + esc(trunc(record.selectedText, 180)) + '</p>' +
          (record.comment ? '<p class="ann-sb__row-comment">' + esc(trunc(record.comment, 120)) + '</p>' : '') +
          (tagsHtml ? '<div class="ann-sb__row-tags">' + tagsHtml + '</div>' : '') +
          '<div class="ann-sb__row-meta">' +
            '<span class="ann-sb__row-label">' + esc(COLOR_LABELS[record.color]||record.color) + '</span>' +
            '<span class="ann-sb__row-dot"></span>' +
            '<span class="ann-sb__row-date">' + esc(fmtDate(record.createdAt)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="ann-sb__row-actions">' +
          '<button class="ann-sb__rbtn ann-sb__rbtn--star' + (record.isFavorite ? " is-active" : "") + '" data-act="fav" title="' + (record.isFavorite?"Quitar favorito":"Marcar favorito") + '">' + SVG.star + '</button>' +
          '<button class="ann-sb__rbtn" data-act="tag" title="Editar etiquetas">' + SVG.tag + '</button>' +
          '<button class="ann-sb__rbtn ann-sb__rbtn--del" data-act="del" title="Eliminar">' + SVG.trash + '</button>' +
        '</div>';

      // Scroll to highlight
      row.querySelector(".ann-sb__row-text").addEventListener("click", function() {
        _scrollTo(record.id);
      });

      // Actions
      row.querySelector('[data-act="fav"]').addEventListener("click", async function() {
        await getStorage().patchHighlight(window.location.href, record.id, { isFavorite: !record.isFavorite });
        await loadData();
      });
      row.querySelector('[data-act="tag"]').addEventListener("click", function() {
        _openOverlay(record);
      });
      row.querySelector('[data-act="del"]').addEventListener("click", async function() {
        row.style.opacity = "0.3";
        row.style.pointerEvents = "none";
        await getStorage().removeHighlight(window.location.href, record.id);
        var mark = document.querySelector('[data-ph-id="' + record.id + '"]');
        if (mark) {
          var parent = mark.parentNode;
          while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
          parent.removeChild(mark);
        }
        await loadData();
      });

      list.appendChild(row);
    });
  }

  function _scrollTo(id) {
    var el = document.querySelector('[data-ph-id="' + id + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    var prev = el.style.outline;
    el.style.outline = "3px solid rgba(250,204,21,0.9)";
    el.style.outlineOffset = "3px";
    setTimeout(function() { el.style.outline = prev; el.style.outlineOffset = ""; }, 2000);
  }

  function _emptyState(svgStr, title, sub) {
    return '<div class="ann-sb__empty">' +
      '<div class="ann-sb__empty-icon">' + svgStr + '</div>' +
      '<p class="ann-sb__empty-title">' + esc(title) + '</p>' +
      '<p class="ann-sb__empty-sub">' + esc(sub) + '</p>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════
  // NOTES PANEL
  // ═══════════════════════════════════════════════════════════

  function _renderNotes(notes) {
    var list = _q("ann-sb-note-list");
    if (!list) return;
    if (!notes || !notes.length) {
      list.innerHTML = _emptyState(SVG.note, "Sin notas", "Crea una nota post-it desde el menú contextual o el popup.");
      return;
    }
    list.innerHTML = "";
    notes.forEach(function(n) {
      var row = document.createElement("div");
      row.className = "ann-sb__note-row";
      row.innerHTML =
        '<div class="ann-sb__note-bar ann-sb__note-bar--' + esc(n.color) + '"></div>' +
        '<div class="ann-sb__note-body">' +
          '<p class="ann-sb__note-title">' + esc(n.title || "Sin título") + '</p>' +
          (n.text ? '<p class="ann-sb__note-text">' + esc(trunc(n.text, 160)) + '</p>' : '') +
          '<p class="ann-sb__note-date">' + esc(fmtDate(n.createdAt)) + '</p>' +
        '</div>';
      list.appendChild(row);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ORGANIZE — Tags & Folders
  // ═══════════════════════════════════════════════════════════

  var _orgHighlights = [];
  var _orgSearch     = "";
  var _orgFilter     = "all";

  async function _refreshOrg() {
    _orgHighlights = await getStorage().getHighlights(window.location.href);
    await _renderTagCloud();
    _renderOrgFilterPills();
    _renderOrgList();
  }

  async function _getAllTags() {
    var s = await getStorage().getSettings();
    return Array.isArray(s.globalTags) ? s.globalTags : [];
  }

  async function _addGlobalTag(tag) {
    var s    = await getStorage().getSettings();
    var tags = Array.isArray(s.globalTags) ? s.globalTags : [];
    if (!tags.includes(tag)) tags.push(tag);
    await getStorage().saveSettings({ globalTags: tags });
  }

  async function _removeGlobalTag(tag) {
    var s    = await getStorage().getSettings();
    var tags = (Array.isArray(s.globalTags) ? s.globalTags : []).filter(function(t) { return t !== tag; });
    await getStorage().saveSettings({ globalTags: tags });
  }

  async function _renderTagCloud() {
    var cloud = _q("ann-sb-tagcloud");
    if (!cloud) return;
    var tags = await _getAllTags();
    cloud.innerHTML = "";

    if (!tags.length) {
      cloud.innerHTML = '<span style="font-size:11.5px;color:#a1a1aa;">Aún no hay etiquetas. Escribe arriba y pulsa Añadir.</span>';
      return;
    }

    tags.forEach(function(tag) {
      var count = _orgHighlights.filter(function(h) { return (h.tags||[]).includes(tag); }).length;
      var pill  = document.createElement("span");
      pill.className = "ann-sb__tagpill" + (_orgFilter === tag ? " is-active" : "");
      pill.innerHTML =
        esc(tag) +
        (count ? '<span class="ann-sb__tagcount"> ' + count + '</span>' : '') +
        '<button class="ann-sb__tagpill-x" data-del="1" title="Eliminar etiqueta">x</button>';

      pill.addEventListener("click", function(e) {
        if (e.target.dataset.del) return;
        _orgFilter = (_orgFilter === tag) ? "all" : tag;
        _renderTagCloud();
        _renderOrgFilterPills();
        _renderOrgList();
      });
      pill.querySelector("[data-del]").addEventListener("click", async function(e) {
        e.stopPropagation();
        await _removeGlobalTag(tag);
        if (_orgFilter === tag) _orgFilter = "all";
        await _refreshOrg();
      });
      cloud.appendChild(pill);
    });
  }

  function _renderOrgFilterPills() {
    var c = _q("ann-sb-org-filters");
    if (!c) return;
    c.innerHTML = "";

    function pill(id, label) {
      var btn = document.createElement("button");
      btn.className = "ann-sb__fpill" + (_orgFilter === id ? " is-active" : "");
      btn.textContent = label;
      btn.addEventListener("click", function() { _orgFilter = id; _renderOrgFilterPills(); _renderOrgList(); });
      c.appendChild(btn);
    }

    pill("all", "Todos");
    pill("untagged", "Sin etiqueta");
    var used = new Set();
    _orgHighlights.forEach(function(h) { (h.tags||[]).forEach(function(t) { used.add(t); }); });
    used.forEach(function(t) { pill(t, t); });
  }

  function _renderOrgList() {
    var list = _q("ann-sb-org-list");
    if (!list) return;

    var items = _orgHighlights.slice();
    if (_orgFilter === "untagged") items = items.filter(function(h) { return !(h.tags && h.tags.length); });
    else if (_orgFilter !== "all") items = items.filter(function(h) { return (h.tags||[]).includes(_orgFilter); });

    if (_orgSearch) {
      var q = _orgSearch.toLowerCase();
      items = items.filter(function(h) {
        return h.selectedText.toLowerCase().includes(q) || (h.tags||[]).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }

    if (!items.length) {
      list.innerHTML = _emptyState(SVG.tag, "Sin resaltados", _orgFilter !== "all" ? 'Ningún resaltado con la etiqueta "' + _orgFilter + '".' : "Crea etiquetas y asígnalas a tus resaltados.");
      return;
    }

    list.innerHTML = "";
    items.forEach(function(record) {
      var row = document.createElement("div");
      row.className = "ann-sb__row";

      var tagsHtml = (record.tags||[]).map(function(t) {
        return '<span class="ann-sb__tag">' + esc(t) + '</span>';
      }).join("") || '<span class="ann-sb__tag ann-sb__tag--suggest" style="color:#a1a1aa;border-color:#e4e4e7;">Sin etiqueta</span>';

      var barClass = record.customColor ? "" : ("ann-sb__color-bar--" + record.color);
      var barStyle = record.customColor ? (' style="background:' + record.customColor + '"') : "";

      row.innerHTML =
        '<div class="ann-sb__color-bar ' + barClass + '"' + barStyle + '></div>' +
        '<div class="ann-sb__row-body">' +
          '<p class="ann-sb__row-text">' + esc(trunc(record.selectedText, 120)) + '</p>' +
          '<div class="ann-sb__row-tags">' + tagsHtml + '</div>' +
        '</div>' +
        '<div class="ann-sb__row-actions">' +
          '<button class="ann-sb__rbtn" data-act="tag" title="Editar etiquetas">' + SVG.tag + '</button>' +
        '</div>';

      row.querySelector('[data-act="tag"]').addEventListener("click", function() { _openOverlay(record); });
      list.appendChild(row);
    });
  }

  // ── Tag overlay ───────────────────────────────────────────────────────────
  var _tagRecord = null;

  function _openOverlay(record) {
    _tagRecord = record;
    _q("ann-sb-overlay-excerpt").textContent = '"' + trunc(record.selectedText, 80) + '"';
    _q("ann-sb-overlay-input").value = "";
    _q("ann-sb-overlay").hidden = false;
    _renderOverlayTags(record.tags || []);
    _renderOverlaySuggestions(record.tags || []);
    _q("ann-sb-overlay-input").focus();
  }

  function _renderOverlayTags(tags) {
    var c = _q("ann-sb-overlay-tags");
    if (!c) return;
    c.innerHTML = "";
    if (!tags.length) {
      c.innerHTML = '<span style="font-size:11.5px;color:#a1a1aa;">Sin etiquetas asignadas.</span>';
      return;
    }
    tags.forEach(function(tag) {
      var chip = document.createElement("span");
      chip.className = "ann-sb__tagpill";
      chip.innerHTML = esc(tag) + '<button class="ann-sb__tagpill-x" title="Quitar">x</button>';
      chip.querySelector("button").addEventListener("click", async function() {
        var next = (_tagRecord.tags||[]).filter(function(t) { return t !== tag; });
        _tagRecord = Object.assign({}, _tagRecord, { tags: next });
        await getStorage().patchHighlight(window.location.href, _tagRecord.id, { tags: next });
        _renderOverlayTags(next);
        _renderOverlaySuggestions(next);
        await _refreshOrg();
        await loadData();
      });
      c.appendChild(chip);
    });
  }

  async function _renderOverlaySuggestions(currentTags) {
    var c = _q("ann-sb-overlay-suggestions");
    if (!c) return;
    c.innerHTML = "";
    var all    = await _getAllTags();
    var unused = all.filter(function(t) { return !currentTags.includes(t); });
    if (!unused.length) return;
    var label = document.createElement("span");
    label.style.cssText = "font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#a1a1aa;align-self:center";
    label.textContent = "Sugerencias";
    c.appendChild(label);
    unused.slice(0, 8).forEach(function(tag) {
      var btn = document.createElement("button");
      btn.className = "ann-sb__tag ann-sb__tag--suggest";
      btn.textContent = tag;
      btn.addEventListener("click", async function() {
        await _addTagToRecord(_tagRecord, tag);
      });
      c.appendChild(btn);
    });
  }

  async function _addTagToRecord(record, tag) {
    if (!tag || !record) return;
    var current = record.tags || [];
    if (current.includes(tag)) return;
    var next = current.concat([tag]);
    _tagRecord = Object.assign({}, record, { tags: next });
    await getStorage().patchHighlight(window.location.href, record.id, { tags: next });
    await _addGlobalTag(tag);
    _renderOverlayTags(next);
    _renderOverlaySuggestions(next);
    await _refreshOrg();
    await loadData();
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════

  function _toggleDropdown() {
    var d = _q("ann-sb-dropdown");
    if (!d) return;
    d.hidden = !d.hidden;
  }
  function _closeDropdown() {
    var d = _q("ann-sb-dropdown");
    if (d) d.hidden = true;
  }

  async function _export(fmt) {
    var s     = getStorage();
    var hl    = await s.getHighlights(window.location.href);
    var notes = await s.getNotes(window.location.href);
    var title = document.title || window.location.href;
    var url   = window.location.href;
    var date  = new Date().toLocaleString("es-ES");
    var content = "";
    var mime = "text/plain", ext = "txt";

    if (fmt === "md") {
      ext = "md";
      content  = "# " + title + "\n\n";
      content += "> " + url + "  \n> Exportado: " + date + "\n\n";
      if (hl.length) {
        content += "## Resaltados\n\n";
        hl.forEach(function(h, i) {
          var cat = (ns.COLOR_OPTIONS.find(function(c) { return c.id === h.color; })||{}).label || h.color;
          content += (i+1) + ". **[" + cat + "]** " + h.selectedText + "\n";
          if (h.comment) content += "   > " + h.comment + "\n";
          if (h.tags && h.tags.length) content += "   *" + h.tags.join(", ") + "*\n";
          content += "\n";
        });
      }
      if (notes.length) {
        content += "## Notas\n\n";
        notes.forEach(function(n) {
          content += "### " + (n.title||"Sin título") + "\n\n" + (n.text||"") + "\n\n";
        });
      }
    } else if (fmt === "json") {
      ext  = "json"; mime = "application/json";
      content = JSON.stringify({ url, exportedAt: new Date().toISOString(), title, highlights: hl, notes }, null, 2);
    } else {
      content  = title + "\n" + url + "\nExportado: " + date + "\n\n";
      if (hl.length) {
        content += "=== RESALTADOS ===\n\n";
        hl.forEach(function(h, i) {
          content += (i+1) + ". " + h.selectedText + "\n";
          if (h.comment) content += "   -> " + h.comment + "\n";
          if (h.tags && h.tags.length) content += "   [" + h.tags.join(", ") + "]\n";
          content += "\n";
        });
      }
      if (notes.length) {
        content += "=== NOTAS ===\n\n";
        notes.forEach(function(n) {
          content += "[" + (n.title||"Sin título") + "]\n" + (n.text||"") + "\n\n";
        });
      }
    }

    var blob = new Blob([content], { type: mime + ";charset=utf-8" });
    var a    = document.createElement("a");
    a.href   = URL.createObjectURL(blob);
    a.download = "annotate-" + new Date().toISOString().slice(0,10) + "." + ext;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function _exportAllMd() {
    var data    = await getStorage().exportAll();
    var content = "# Annotate — Exportacion completa\nExportado: " + new Date().toLocaleString("es-ES") + "\n\n";
    var byUrl   = {};
    (data.highlights||[]).forEach(function(h) {
      if (!byUrl[h.url]) byUrl[h.url] = [];
      byUrl[h.url].push(h);
    });
    Object.keys(byUrl).forEach(function(url) {
      content += "## " + url + "\n\n";
      byUrl[url].forEach(function(h, i) {
        var cat = (ns.COLOR_OPTIONS.find(function(c) { return c.id === h.color; })||{}).label || h.color;
        content += (i+1) + ". **[" + cat + "]** " + h.selectedText + "\n";
        if (h.comment) content += "   > " + h.comment + "\n";
        if (h.tags && h.tags.length) content += "   *" + h.tags.join(", ") + "*\n";
        content += "\n";
      });
    });
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var a    = document.createElement("a");
    a.href   = URL.createObjectURL(blob);
    a.download = "annotate-all-" + new Date().toISOString().slice(0,10) + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function _copyAll() {
    var hl = await getStorage().getHighlights(window.location.href);
    if (!hl.length) return;
    var text = hl.map(function(h, i) {
      return (i+1) + ". " + h.selectedText + (h.comment ? "\n   -> " + h.comment : "");
    }).join("\n\n");
    try { await navigator.clipboard.writeText(text); } catch(_) {}
  }

  // ═══════════════════════════════════════════════════════════
  // FLASHCARDS
  // ═══════════════════════════════════════════════════════════

  var _fcCards   = [];
  var _fcIdx     = 0;
  var _fcRevealed = false;

  function _initFlashcards() {
    _q("ann-sb-start-fc").addEventListener("click", async function() {
      var colorFilter = _q("ann-sb-fc-color").value;
      var mode        = _q("ann-sb-fc-mode").value;
      var hl = await getStorage().getHighlights(window.location.href);

      if (colorFilter !== "all") hl = hl.filter(function(h) { return h.color === colorFilter; });
      if (mode === "qa") {
        var withComment = hl.filter(function(h) { return h.comment && h.comment.trim(); });
        if (withComment.length) hl = withComment;
      }

      if (!hl.length) {
        var st = _q("ann-sb-fc-status");
        if (st) { st.textContent = "Sin resaltados con ese filtro."; setTimeout(function() { st.textContent=""; }, 2500); }
        return;
      }

      _fcCards    = hl.slice().sort(function() { return Math.random()-0.5; });
      _fcIdx      = 0;
      _fcRevealed = false;
      _q("ann-sb-study-cfg").hidden = true;
      _q("ann-sb-fc-session").hidden = false;
      _renderCard();
    });

    _q("ann-sb-fc-stop").addEventListener("click", function() {
      _q("ann-sb-fc-session").hidden = true;
      _q("ann-sb-study-cfg").hidden  = false;
    });

    _q("ann-sb-fc-reveal").addEventListener("click", _revealCard);

    _q("ann-sb-fc-flip").addEventListener("click", function() {
      if (!_fcRevealed) {
        _revealCard();
      } else {
        if (_fcIdx < _fcCards.length - 1) { _fcIdx++; _renderCard(); }
        else {
          // End of deck
          _q("ann-sb-fc-session").hidden = true;
          _q("ann-sb-study-cfg").hidden  = false;
        }
      }
    });

    _q("ann-sb-fc-next").addEventListener("click", function() {
      if (_fcIdx < _fcCards.length-1) { _fcIdx++; _renderCard(); }
    });
    _q("ann-sb-fc-prev").addEventListener("click", function() {
      if (_fcIdx > 0) { _fcIdx--; _renderCard(); }
    });

    // Keyboard
    document.addEventListener("keydown", function(e) {
      if (!isOpen) return;
      var sess = _q("ann-sb-fc-session");
      if (!sess || sess.hidden) return;
      if (e.key === " " || e.key === "f") { e.preventDefault(); _q("ann-sb-fc-flip").click(); }
      if (e.key === "ArrowRight") { e.preventDefault(); _q("ann-sb-fc-next").click(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); _q("ann-sb-fc-prev").click(); }
    });
  }

  function _renderCard() {
    if (!_fcCards.length) return;
    _fcRevealed = false;

    var card  = _fcCards[_fcIdx];
    var mode  = _q("ann-sb-fc-mode").value;
    var total = _fcCards.length;
    var pct   = (100 * (_fcIdx+1) / total).toFixed(1);

    _q("ann-sb-fc-counter").textContent = (_fcIdx+1) + " / " + total;
    _q("ann-sb-fc-fill").style.width    = pct + "%";

    var colorLabel = (ns.COLOR_OPTIONS.find(function(c) { return c.id === card.color; })||{}).label || card.color;

    if (mode === "qa" && card.comment && card.comment.trim()) {
      _q("ann-sb-fc-front-label").textContent = "Contexto / Pregunta";
      _q("ann-sb-fc-front-text").textContent  = card.comment.trim();
      _q("ann-sb-fc-back-text").textContent   = card.selectedText;
    } else {
      _q("ann-sb-fc-front-label").textContent = colorLabel + " — ¿Recuerdas este fragmento?";
      _q("ann-sb-fc-front-text").textContent  = trunc(card.selectedText, 60).replace(/\S+/g, "████");
      _q("ann-sb-fc-back-text").textContent   = card.selectedText;
    }

    // Reset reveal state
    _q("ann-sb-fc-back").hidden    = true;
    _q("ann-sb-fc-divider").hidden = true;
    _q("ann-sb-fc-answer-label").textContent = "Respuesta oculta";
    _q("ann-sb-fc-reveal").innerHTML = SVG.eye + " Revelar";
    _q("ann-sb-fc-flip").innerHTML   = SVG.flip + " Revelar y continuar";

    // Update next/prev state
    _q("ann-sb-fc-prev").disabled = (_fcIdx === 0);
    _q("ann-sb-fc-next").disabled = (_fcIdx >= _fcCards.length-1);

    // Animate
    var cardEl = _q("ann-sb-fc-card");
    cardEl.classList.remove("ann-sb__fc-card--anim");
    void cardEl.offsetWidth;
    cardEl.classList.add("ann-sb__fc-card--anim");
  }

  function _revealCard() {
    _fcRevealed = true;
    _q("ann-sb-fc-back").hidden    = false;
    _q("ann-sb-fc-divider").hidden = false;
    _q("ann-sb-fc-answer-label").textContent = "Respuesta";
    _q("ann-sb-fc-reveal").innerHTML = SVG.check + " Mostrado";
    _q("ann-sb-fc-reveal").disabled = true;
    _q("ann-sb-fc-flip").innerHTML   = _fcIdx < _fcCards.length-1
      ? (SVG.next + " Siguiente carta")
      : (SVG.check + " Terminar sesion");
  }

  // ═══════════════════════════════════════════════════════════
  // OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════

  function openSidebar() {
    if (!sidebarEl) buildSidebar();
    sidebarEl.classList.remove("ann-sidebar--closed");
    isOpen = true;
    loadData();
  }

  function closeSidebar() {
    if (sidebarEl) sidebarEl.classList.add("ann-sidebar--closed");
    isOpen = false;
    _closeDropdown();
  }

  function toggleSidebar() {
    if (isOpen) closeSidebar(); else openSidebar();
  }

  // ── FAB ───────────────────────────────────────────────────────────────────
  function buildFab() {
    if (document.getElementById("ann-fab")) return;
    var fab = document.createElement("button");
    fab.id        = "ann-fab";
    fab.className = "ann-fab";
    fab.title     = "Annotate — Abrir panel";
    fab.textContent = "AN";
    fab.addEventListener("click", toggleSidebar);
    document.documentElement.appendChild(fab);
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === "TOGGLE_SIDEBAR")  toggleSidebar();
    if (msg.type === "OPEN_SIDEBAR")    openSidebar();
    if (msg.type === "CLOSE_SIDEBAR")   closeSidebar();
    if (msg.type === "REFRESH_SIDEBAR" && isOpen) loadData();
  });

  chrome.storage.onChanged.addListener(function() {
    if (isOpen) loadData();
  });

  buildFab();
})(globalThis);
