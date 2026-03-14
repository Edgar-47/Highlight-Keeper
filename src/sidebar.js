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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function trunc(s, n) { s = String(s || ""); return s.length <= n ? s : s.slice(0, n) + "…"; }

  function colorDot(record) {
    if (record.customColor)
      return '<span class="ann-sdot" style="background:' + record.customColor + '"></span>';
    return '<span class="ann-sdot ann-sdot--' + record.color + '"></span>';
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString("es-ES", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (_e) { return iso; }
  }

  // ── Build sidebar DOM ─────────────────────────────────────────────────────
  function buildSidebar() {
    if (sidebarEl) return;

    const el = document.createElement("div");
    el.id = "ann-sidebar";
    el.className = "ann-sidebar ann-sidebar--closed";
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", "Annotate – Panel de resumen");
    el.innerHTML = `
      <div class="ann-sb__header">
        <span class="ann-sb__logo">✦</span>
        <span class="ann-sb__title">Annotate</span>
        <div class="ann-sb__header-actions">
          <button class="ann-sb__icon-btn" id="ann-sb-export-btn" title="Exportar">⬇</button>
          <button class="ann-sb__close" id="ann-sb-close" title="Cerrar">✕</button>
        </div>
      </div>

      <div class="ann-sb__tabs" role="tablist">
        <button class="ann-sb__tab is-active" data-tab="sb-highlights" role="tab" aria-selected="true">
          ◆ Resaltados <span id="ann-sb-hl-n" class="ann-sb__badge">0</span>
        </button>
        <button class="ann-sb__tab" data-tab="sb-notes" role="tab" aria-selected="false">
          □ Notas <span id="ann-sb-note-n" class="ann-sb__badge ann-sb__badge--soft">0</span>
        </button>
        <button class="ann-sb__tab" data-tab="sb-organize" role="tab" aria-selected="false">
          🏷 Tags
        </button>
        <button class="ann-sb__tab" data-tab="sb-study" role="tab" aria-selected="false">
          🎓 Estudio
        </button>
      </div>

      <!-- ══ HIGHLIGHTS PANEL ══ -->
      <div id="sb-highlights" class="ann-sb__panel is-active" role="tabpanel">
        <div class="ann-sb__search-row">
          <input id="ann-sb-search" type="search" placeholder="Buscar resaltados…" class="ann-sb__search" autocomplete="off" />
        </div>
        <div id="ann-sb-filters" class="ann-sb__chips"></div>
        <div id="ann-sb-hl-list" class="ann-sb__list">
          <p class="ann-sb__empty">Cargando…</p>
        </div>
        <div class="ann-sb__footer-actions">
          <button id="ann-sb-export-md"   class="ann-sb__pill">⬇ MD</button>
          <button id="ann-sb-export-txt"  class="ann-sb__pill">⬇ TXT</button>
          <button id="ann-sb-export-json" class="ann-sb__pill">⬇ JSON</button>
          <button id="ann-sb-copy-all"    class="ann-sb__pill">📋 Copiar</button>
        </div>
      </div>

      <!-- ══ NOTES PANEL ══ -->
      <div id="sb-notes" class="ann-sb__panel" role="tabpanel" hidden>
        <div id="ann-sb-note-list" class="ann-sb__list">
          <p class="ann-sb__empty">Sin notas en esta página.</p>
        </div>
      </div>

      <!-- ══ ORGANIZE PANEL ══ -->
      <div id="sb-organize" class="ann-sb__panel" role="tabpanel" hidden>
        <div class="ann-sb__organize-section">
          <p class="ann-sb__section-label">Etiquetas / Carpetas</p>
          <div class="ann-sb__tag-input-row">
            <input id="ann-sb-tag-input" type="text" placeholder="Nueva etiqueta… ej. IA, tesis" class="ann-sb__search" maxlength="32" />
            <button id="ann-sb-tag-add" class="ann-sb__pill ann-sb__pill--primary">+ Añadir</button>
          </div>
          <div id="ann-sb-tag-cloud" class="ann-sb__tag-cloud">
            <p class="ann-sb__empty" style="padding:4px 0;">Sin etiquetas aún.</p>
          </div>
        </div>
        <p class="ann-sb__section-label" style="padding:8px 14px 4px;">Resaltados</p>
        <div class="ann-sb__search-row">
          <input id="ann-sb-org-search" type="search" placeholder="Buscar…" class="ann-sb__search" autocomplete="off" />
        </div>
        <div id="ann-sb-org-filter-chips" class="ann-sb__chips"></div>
        <div id="ann-sb-org-list" class="ann-sb__list">
          <p class="ann-sb__empty">Cargando…</p>
        </div>
      </div>

      <!-- ══ STUDY PANEL ══ -->
      <div id="sb-study" class="ann-sb__panel" role="tabpanel" hidden>
        <div id="ann-sb-study-intro">
          <p class="ann-sb__section-label" style="padding:12px 14px 4px;">Modo estudio — Flashcards</p>
          <div class="ann-sb__study-config">
            <div class="ann-sb__field-row">
              <label class="ann-sb__field-label">Color / categoría</label>
              <select id="ann-sb-fc-color" class="ann-sb__select">
                <option value="all">Todos los colores</option>
                <option value="green">🟢 Idea clave</option>
                <option value="blue">🔵 Info</option>
                <option value="purple">🟣 Duda</option>
                <option value="orange">🟠 Repasar</option>
                <option value="red">🔴 Importante</option>
                <option value="yellow">🟡 Amarillo</option>
              </select>
            </div>
            <div class="ann-sb__field-row">
              <label class="ann-sb__field-label">Modo</label>
              <select id="ann-sb-fc-mode" class="ann-sb__select">
                <option value="recall">Recordar (texto oculto)</option>
                <option value="qa">Pregunta → Respuesta</option>
              </select>
            </div>
            <button id="ann-sb-start-fc" class="ann-sb__pill ann-sb__pill--primary ann-sb__pill--full">▶ Empezar sesión</button>
            <p id="ann-sb-fc-status" class="ann-sb__status-line"></p>
          </div>
          <div class="ann-sb__study-tip">
            <strong>💡 Consejo:</strong> Usa el color <em>Duda</em> 🟣 para marcar conceptos difíciles,
            y añade un comentario al resaltado para activar el modo Pregunta→Respuesta.
          </div>
        </div>

        <!-- Active flashcard area -->
        <div id="ann-sb-fc-area" class="ann-sb__fc-area" hidden>
          <div class="ann-sb__fc-progress-row">
            <span id="ann-sb-fc-idx">1</span> / <span id="ann-sb-fc-total">?</span>
            <div class="ann-sb__fc-bar"><div id="ann-sb-fc-fill" class="ann-sb__fc-fill"></div></div>
          </div>
          <div id="ann-sb-fc-card" class="ann-sb__fc-card">
            <div class="ann-sb__fc-face" id="ann-sb-fc-front">
              <p class="ann-sb__fc-label" id="ann-sb-fc-front-label">¿Recuerdas este fragmento?</p>
              <p class="ann-sb__fc-text" id="ann-sb-fc-front-text"></p>
            </div>
            <div class="ann-sb__fc-face ann-sb__fc-back" id="ann-sb-fc-back" hidden>
              <p class="ann-sb__fc-label">Respuesta</p>
              <p class="ann-sb__fc-text" id="ann-sb-fc-back-text"></p>
            </div>
          </div>
          <div class="ann-sb__fc-btns">
            <button id="ann-sb-fc-flip" class="ann-sb__pill ann-sb__pill--primary" style="flex:2">Voltear ↩</button>
            <button id="ann-sb-fc-prev" class="ann-sb__pill" style="flex:1">‹</button>
            <button id="ann-sb-fc-next" class="ann-sb__pill" style="flex:1">›</button>
          </div>
          <button id="ann-sb-fc-stop" class="ann-sb__pill ann-sb__pill--ghost ann-sb__pill--full" style="margin-top:6px">✕ Terminar</button>
        </div>
      </div>

      <!-- ══ TAG EDITOR MODAL ══ -->
      <div id="ann-sb-tag-modal" class="ann-sb__tag-modal" hidden>
        <div class="ann-sb__tag-modal-inner">
          <p class="ann-sb__tag-modal-title">✏️ Editar etiquetas</p>
          <p id="ann-sb-tag-modal-text" class="ann-sb__tag-modal-excerpt"></p>
          <div class="ann-sb__tag-input-row">
            <input id="ann-sb-tag-modal-input" type="text" placeholder="Nueva etiqueta…" class="ann-sb__search" maxlength="32" />
            <button id="ann-sb-tag-modal-add" class="ann-sb__pill ann-sb__pill--primary">+</button>
          </div>
          <div id="ann-sb-tag-modal-chips" class="ann-sb__tag-cloud" style="min-height:24px;margin-top:8px;"></div>
          <div id="ann-sb-tag-suggestions" class="ann-sb__tag-suggestions"></div>
          <div class="ann-sb__tag-modal-actions">
            <button id="ann-sb-tag-modal-close" class="ann-sb__pill">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(el);
    sidebarEl = el;

    // ── Tab switching ─────────────────────────────────────────────────────
    el.querySelectorAll(".ann-sb__tab").forEach(function(btn) {
      btn.addEventListener("click", function() {
        el.querySelectorAll(".ann-sb__tab").forEach(function(b) {
          b.classList.remove("is-active");
          b.setAttribute("aria-selected","false");
        });
        el.querySelectorAll(".ann-sb__panel").forEach(function(p) {
          p.classList.remove("is-active");
          p.hidden = true;
        });
        btn.classList.add("is-active");
        btn.setAttribute("aria-selected","true");
        const panel = document.getElementById(btn.dataset.tab);
        if (panel) { panel.classList.add("is-active"); panel.hidden = false; }
        if (btn.dataset.tab === "sb-organize") _refreshOrgPanel();
      });
    });

    // ── Core actions ──────────────────────────────────────────────────────
    document.getElementById("ann-sb-close").addEventListener("click", closeSidebar);
    document.getElementById("ann-sb-export-btn").addEventListener("click", function(e) {
      e.stopPropagation();
      _showExportMenu(this);
    });
    document.getElementById("ann-sb-search").addEventListener("input", function(e) {
      renderHighlights(e.target.value.trim());
    });

    // ── Export ────────────────────────────────────────────────────────────
    document.getElementById("ann-sb-export-md").addEventListener("click", function() { exportAs("md"); });
    document.getElementById("ann-sb-export-txt").addEventListener("click", function() { exportAs("txt"); });
    document.getElementById("ann-sb-export-json").addEventListener("click", function() { exportAs("json"); });
    document.getElementById("ann-sb-copy-all").addEventListener("click", copyAll);

    // ── Organize ──────────────────────────────────────────────────────────
    document.getElementById("ann-sb-tag-input").addEventListener("keydown", function(e) {
      if (e.key === "Enter") document.getElementById("ann-sb-tag-add").click();
    });
    document.getElementById("ann-sb-tag-add").addEventListener("click", async function() {
      const inp = document.getElementById("ann-sb-tag-input");
      const tag = inp.value.trim();
      if (!tag) return;
      inp.value = "";
      await _addGlobalTag(tag);
      await _refreshOrgPanel();
    });
    document.getElementById("ann-sb-org-search").addEventListener("input", function(e) {
      _orgSearch = e.target.value.trim();
      _renderOrgList();
    });

    // ── Tag modal ─────────────────────────────────────────────────────────
    document.getElementById("ann-sb-tag-modal-close").addEventListener("click", function() {
      document.getElementById("ann-sb-tag-modal").hidden = true;
    });
    document.getElementById("ann-sb-tag-modal-input").addEventListener("keydown", function(e) {
      if (e.key === "Enter") document.getElementById("ann-sb-tag-modal-add").click();
    });
    document.getElementById("ann-sb-tag-modal-add").addEventListener("click", async function() {
      const inp = document.getElementById("ann-sb-tag-modal-input");
      const tag = inp.value.trim();
      if (!tag || !_tagModalRecord) return;
      inp.value = "";
      await _addTagToRecord(_tagModalRecord, tag);
    });

    // ── Flashcards ────────────────────────────────────────────────────────
    initFlashcards();
  }

  // ═══════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════

  let _highlights = [];
  let _notes      = [];
  let _hlFilter   = "all";

  async function loadData() {
    const s = getStorage();
    _highlights = await s.getHighlights(window.location.href);
    _notes      = await s.getNotes(window.location.href);

    const hlN   = document.getElementById("ann-sb-hl-n");
    const noteN = document.getElementById("ann-sb-note-n");
    if (hlN)   hlN.textContent   = String(_highlights.length);
    if (noteN) noteN.textContent = String(_notes.length);

    renderFilterChips();
    const q = document.getElementById("ann-sb-search");
    renderHighlights(q ? q.value.trim() : "");
    renderNotes(_notes);
  }

  // ═══════════════════════════════════════════════════════════
  // HIGHLIGHTS PANEL
  // ═══════════════════════════════════════════════════════════

  function renderFilterChips() {
    const container = document.getElementById("ann-sb-filters");
    if (!container) return;
    container.innerHTML = "";

    const counts = { all: _highlights.length };
    ns.COLOR_OPTIONS.forEach(function(c) {
      const n = _highlights.filter(function(h) { return h.color === c.id; }).length;
      if (n) counts[c.id] = n;
    });
    const favCount = _highlights.filter(function(h) { return h.isFavorite; }).length;

    function chip(id, label, extraClass) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ann-sb__chip" + (_hlFilter === id ? " is-active" : "") + (extraClass ? " " + extraClass : "");
      btn.textContent = label;
      btn.addEventListener("click", function() {
        _hlFilter = id;
        renderFilterChips();
        renderHighlights(document.getElementById("ann-sb-search").value.trim());
      });
      container.appendChild(btn);
    }

    chip("all", "Todos " + counts.all);
    ns.COLOR_OPTIONS.forEach(function(c) {
      if (counts[c.id]) chip(c.id, c.circle + " " + counts[c.id]);
    });
    if (favCount > 0) chip("favorite", "⭐ " + favCount, "ann-sb__chip--fav");
  }

  function renderHighlights(query) {
    const list = document.getElementById("ann-sb-hl-list");
    if (!list) return;

    let items = _highlights.slice();
    if (_hlFilter === "favorite") items = items.filter(function(h) { return h.isFavorite; });
    else if (_hlFilter !== "all") items = items.filter(function(h) { return h.color === _hlFilter; });

    if (query) {
      const q = query.toLowerCase();
      items = items.filter(function(h) {
        return h.selectedText.toLowerCase().includes(q) ||
               (h.comment || "").toLowerCase().includes(q) ||
               (h.tags || []).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }

    if (!items.length) {
      list.innerHTML = '<p class="ann-sb__empty">' +
        (query ? "Sin resultados para «" + esc(query) + "»." :
         _hlFilter !== "all" ? "Sin resaltados con este filtro." :
         "Aún no hay resaltados en esta página.") +
        '</p>';
      return;
    }

    list.innerHTML = "";
    items.forEach(function(record) {
      const row = document.createElement("div");
      row.className = "ann-sb__hl-row";

      const tagsHtml = (record.tags || []).map(function(t) {
        return '<span class="ann-sb__mini-tag">' + esc(t) + '</span>';
      }).join("");

      const colorLabel = (ns.COLOR_OPTIONS.find(function(c) { return c.id === record.color; }) || {}).label || record.color;

      row.innerHTML =
        '<div class="ann-sb__hl-left">' + colorDot(record) + '</div>' +
        '<div class="ann-sb__hl-body">' +
          '<p class="ann-sb__hl-text ann-sb__hl-text--link">' + esc(trunc(record.selectedText, 140)) + '</p>' +
          (record.comment ? '<p class="ann-sb__hl-comment">💬 ' + esc(trunc(record.comment, 80)) + '</p>' : '') +
          (tagsHtml ? '<div class="ann-sb__hl-tags">' + tagsHtml + '</div>' : '') +
          '<p class="ann-sb__hl-meta">' + esc(colorLabel) + ' · ' + fmtDate(record.createdAt) + '</p>' +
        '</div>' +
        '<div class="ann-sb__hl-actions">' +
          '<button class="ann-sb__row-btn" data-action="fav" title="' + (record.isFavorite ? "Quitar favorito" : "Marcar favorito") + '">' +
            (record.isFavorite ? "★" : "☆") +
          '</button>' +
          '<button class="ann-sb__row-btn" data-action="tag" title="Editar etiquetas">🏷</button>' +
          '<button class="ann-sb__row-btn ann-sb__row-btn--del" data-action="del" title="Eliminar resaltado">✕</button>' +
        '</div>';

      // Scroll to highlight in page
      row.querySelector(".ann-sb__hl-text--link").addEventListener("click", function() {
        _scrollToHighlight(record.id);
      });

      // Favorite toggle
      row.querySelector('[data-action="fav"]').addEventListener("click", async function() {
        await getStorage().patchHighlight(window.location.href, record.id, { isFavorite: !record.isFavorite });
        await loadData();
      });

      // Tag editor
      row.querySelector('[data-action="tag"]').addEventListener("click", function() {
        _openTagModal(record);
      });

      // Delete
      row.querySelector('[data-action="del"]').addEventListener("click", async function() {
        row.style.opacity = "0.35";
        row.style.pointerEvents = "none";
        await getStorage().removeHighlight(window.location.href, record.id);
        // Remove DOM mark on page
        const mark = document.querySelector('[data-ph-id="' + record.id + '"]');
        if (mark) {
          const parent = mark.parentNode;
          while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
          parent.removeChild(mark);
        }
        await loadData();
      });

      list.appendChild(row);
    });
  }

  function _scrollToHighlight(id) {
    const el = document.querySelector('[data-ph-id="' + id + '"]');
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const prev = el.style.outline;
      el.style.outline = "3px solid rgba(250,204,21,0.95)";
      el.style.outlineOffset = "3px";
      setTimeout(function() { el.style.outline = prev; el.style.outlineOffset = ""; }, 2000);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NOTES PANEL
  // ═══════════════════════════════════════════════════════════

  function renderNotes(notes) {
    const list = document.getElementById("ann-sb-note-list");
    if (!list) return;
    if (!notes || !notes.length) {
      list.innerHTML = '<p class="ann-sb__empty">Sin notas post-it en esta página.</p>';
      return;
    }
    list.innerHTML = "";
    notes.forEach(function(n) {
      const row = document.createElement("div");
      row.className = "ann-sb__note-row ann-sb__note-row--" + n.color;
      row.innerHTML =
        '<p class="ann-sb__note-title">' + esc(n.title || "Sin título") + '</p>' +
        (n.text ? '<p class="ann-sb__note-text">' + esc(trunc(n.text, 140)) + '</p>' : '') +
        '<p class="ann-sb__hl-meta">' + fmtDate(n.createdAt) + '</p>';
      list.appendChild(row);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ORGANIZE PANEL — Tags & Folders
  // ═══════════════════════════════════════════════════════════

  let _orgHighlights = [];
  let _orgSearch     = "";
  let _orgFilter     = "all";

  async function _refreshOrgPanel() {
    _orgHighlights = await getStorage().getHighlights(window.location.href);
    await _renderTagCloud();
    _renderOrgFilterChips();
    _renderOrgList();
  }

  async function _getAllTags() {
    const s = await getStorage().getSettings();
    return Array.isArray(s.globalTags) ? s.globalTags : [];
  }

  async function _addGlobalTag(tag) {
    const s    = await getStorage().getSettings();
    const tags = Array.isArray(s.globalTags) ? s.globalTags : [];
    if (!tags.includes(tag)) tags.push(tag);
    await getStorage().saveSettings({ globalTags: tags });
  }

  async function _removeGlobalTag(tag) {
    const s    = await getStorage().getSettings();
    const tags = (Array.isArray(s.globalTags) ? s.globalTags : []).filter(function(t) { return t !== tag; });
    await getStorage().saveSettings({ globalTags: tags });
  }

  async function _renderTagCloud() {
    const cloud = document.getElementById("ann-sb-tag-cloud");
    if (!cloud) return;
    const tags = await _getAllTags();
    cloud.innerHTML = "";

    if (!tags.length) {
      cloud.innerHTML = '<p class="ann-sb__empty" style="padding:4px 0;">Sin etiquetas. Escribe arriba para crear una.</p>';
      return;
    }

    tags.forEach(function(tag) {
      // Count how many highlights on this page use this tag
      const count = _orgHighlights.filter(function(h) { return (h.tags || []).includes(tag); }).length;
      const chip = document.createElement("span");
      chip.className = "ann-sb__tag-chip ann-sb__tag-chip--manage" + (_orgFilter === tag ? " is-active" : "");
      chip.innerHTML =
        '<span class="ann-sb__tag-label">' + esc(tag) + (count ? ' <em>(' + count + ')</em>' : '') + '</span>' +
        '<button class="ann-sb__tag-del" title="Eliminar etiqueta global">✕</button>';
      chip.querySelector(".ann-sb__tag-label").addEventListener("click", function() {
        _orgFilter = (_orgFilter === tag) ? "all" : tag;
        _renderTagCloud();
        _renderOrgFilterChips();
        _renderOrgList();
      });
      chip.querySelector(".ann-sb__tag-del").addEventListener("click", async function(e) {
        e.stopPropagation();
        await _removeGlobalTag(tag);
        if (_orgFilter === tag) _orgFilter = "all";
        await _refreshOrgPanel();
      });
      cloud.appendChild(chip);
    });
  }

  function _renderOrgFilterChips() {
    const container = document.getElementById("ann-sb-org-filter-chips");
    if (!container) return;
    container.innerHTML = "";

    function fchip(id, label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ann-sb__chip" + (_orgFilter === id ? " is-active" : "");
      btn.textContent = label;
      btn.addEventListener("click", function() { _orgFilter = id; _renderOrgFilterChips(); _renderOrgList(); });
      container.appendChild(btn);
    }

    fchip("all", "Todos");
    fchip("untagged", "Sin tag");
    const tagsUsed = new Set();
    _orgHighlights.forEach(function(h) { (h.tags || []).forEach(function(t) { tagsUsed.add(t); }); });
    tagsUsed.forEach(function(t) { fchip(t, t); });
  }

  function _renderOrgList() {
    const list = document.getElementById("ann-sb-org-list");
    if (!list) return;

    let items = _orgHighlights.slice();
    if (_orgFilter === "untagged") items = items.filter(function(h) { return !(h.tags && h.tags.length); });
    else if (_orgFilter !== "all") items = items.filter(function(h) { return (h.tags || []).includes(_orgFilter); });

    if (_orgSearch) {
      const q = _orgSearch.toLowerCase();
      items = items.filter(function(h) {
        return h.selectedText.toLowerCase().includes(q) ||
               (h.tags || []).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }

    if (!items.length) {
      list.innerHTML = '<p class="ann-sb__empty">Sin resaltados' +
        (_orgFilter !== "all" ? ' con la etiqueta "' + esc(_orgFilter) + '"' : "") + '.</p>';
      return;
    }

    list.innerHTML = "";
    items.forEach(function(record) {
      const row = document.createElement("div");
      row.className = "ann-sb__hl-row";
      const tagsHtml = (record.tags || []).map(function(t) {
        return '<span class="ann-sb__mini-tag">' + esc(t) + '</span>';
      }).join("");

      row.innerHTML =
        '<div class="ann-sb__hl-left">' + colorDot(record) + '</div>' +
        '<div class="ann-sb__hl-body">' +
          '<p class="ann-sb__hl-text">' + esc(trunc(record.selectedText, 100)) + '</p>' +
          (tagsHtml ? '<div class="ann-sb__hl-tags">' + tagsHtml + '</div>' :
            '<p class="ann-sb__hl-meta" style="font-style:italic;">Sin etiquetas</p>') +
        '</div>' +
        '<div class="ann-sb__hl-actions">' +
          '<button class="ann-sb__row-btn" data-action="tag" title="Editar etiquetas">🏷</button>' +
        '</div>';

      row.querySelector('[data-action="tag"]').addEventListener("click", function() {
        _openTagModal(record);
      });
      list.appendChild(row);
    });
  }

  // ── Tag Modal ─────────────────────────────────────────────────────────────
  let _tagModalRecord = null;

  function _openTagModal(record) {
    _tagModalRecord = record;
    const modal = document.getElementById("ann-sb-tag-modal");
    document.getElementById("ann-sb-tag-modal-text").textContent = '"' + trunc(record.selectedText, 70) + '"';
    document.getElementById("ann-sb-tag-modal-input").value = "";
    modal.hidden = false;
    _renderTagModalChips(record.tags || []);
    _renderTagSuggestions(record.tags || []);
    document.getElementById("ann-sb-tag-modal-input").focus();
  }

  function _renderTagModalChips(tags) {
    const container = document.getElementById("ann-sb-tag-modal-chips");
    if (!container) return;
    container.innerHTML = "";
    if (!tags.length) {
      container.innerHTML = '<p class="ann-sb__empty" style="font-size:11px;padding:4px 0;">Sin etiquetas asignadas.</p>';
      return;
    }
    tags.forEach(function(tag) {
      const chip = document.createElement("span");
      chip.className = "ann-sb__tag-chip ann-sb__tag-chip--manage";
      chip.innerHTML =
        '<span class="ann-sb__tag-label">' + esc(tag) + '</span>' +
        '<button class="ann-sb__tag-del" title="Quitar">✕</button>';
      chip.querySelector(".ann-sb__tag-del").addEventListener("click", async function() {
        const next = (_tagModalRecord.tags || []).filter(function(t) { return t !== tag; });
        _tagModalRecord = Object.assign({}, _tagModalRecord, { tags: next });
        await getStorage().patchHighlight(window.location.href, _tagModalRecord.id, { tags: next });
        _renderTagModalChips(next);
        _renderTagSuggestions(next);
        await _refreshOrgPanel();
        await loadData();
      });
      container.appendChild(chip);
    });
  }

  async function _renderTagSuggestions(currentTags) {
    const container = document.getElementById("ann-sb-tag-suggestions");
    if (!container) return;
    const allTags = await _getAllTags();
    const unused  = allTags.filter(function(t) { return !currentTags.includes(t); });
    if (!unused.length) { container.innerHTML = ""; return; }
    container.innerHTML = '<span class="ann-sb__suggest-label">Añadir:</span>';
    unused.slice(0, 6).forEach(function(tag) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ann-sb__mini-tag ann-sb__mini-tag--suggest";
      btn.textContent = tag;
      btn.addEventListener("click", async function() {
        await _addTagToRecord(_tagModalRecord, tag);
      });
      container.appendChild(btn);
    });
  }

  async function _addTagToRecord(record, tag) {
    if (!tag || !record) return;
    const current = record.tags || [];
    if (current.includes(tag)) return;
    const next = current.concat([tag]);
    _tagModalRecord = Object.assign({}, record, { tags: next });
    await getStorage().patchHighlight(window.location.href, record.id, { tags: next });
    await _addGlobalTag(tag);
    _renderTagModalChips(next);
    _renderTagSuggestions(next);
    await _refreshOrgPanel();
    await loadData();
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════

  async function exportAs(fmt) {
    const s     = getStorage();
    const hl    = await s.getHighlights(window.location.href);
    const notes = await s.getNotes(window.location.href);
    const title = document.title || window.location.href;
    const url   = window.location.href;
    const date  = new Date().toLocaleString("es-ES");
    let content = "";
    let mime    = "text/plain";
    let ext     = "txt";

    if (fmt === "md") {
      ext = "md";
      content  = "# " + title + "\n\n";
      content += "> 🔗 " + url + "  \n> 📅 Exportado: " + date + "\n\n";
      if (hl.length) {
        content += "## Resaltados\n\n";
        hl.forEach(function(h, i) {
          const cat = (ns.COLOR_OPTIONS.find(function(c) { return c.id === h.color; }) || {}).label || h.color;
          content += (i + 1) + ". **[" + cat + "]** " + h.selectedText + "\n";
          if (h.comment) content += "   > 💬 " + h.comment + "\n";
          if (h.tags && h.tags.length) content += "   *🏷 " + h.tags.join(", ") + "*\n";
          content += "\n";
        });
      }
      if (notes.length) {
        content += "## Notas post-it\n\n";
        notes.forEach(function(n) {
          content += "### " + (n.title || "Sin título") + "\n\n" + (n.text || "*(vacía)*") + "\n\n";
        });
      }
    } else if (fmt === "json") {
      ext  = "json";
      mime = "application/json";
      content = JSON.stringify({
        url, exportedAt: new Date().toISOString(), title, highlights: hl, notes
      }, null, 2);
    } else {
      content  = title + "\n" + url + "\nExportado: " + date + "\n\n";
      if (hl.length) {
        content += "=== RESALTADOS ===\n\n";
        hl.forEach(function(h, i) {
          content += (i + 1) + ". " + h.selectedText + "\n";
          if (h.comment) content += "   → " + h.comment + "\n";
          if (h.tags && h.tags.length) content += "   [" + h.tags.join(", ") + "]\n";
          content += "\n";
        });
      }
      if (notes.length) {
        content += "=== NOTAS ===\n\n";
        notes.forEach(function(n) {
          content += "[" + (n.title || "Sin título") + "]\n" + (n.text || "") + "\n\n";
        });
      }
    }

    const blob = new Blob([content], { type: mime + ";charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "annotate-" + new Date().toISOString().slice(0, 10) + "." + ext;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyAll() {
    const hl = await getStorage().getHighlights(window.location.href);
    if (!hl.length) return;
    const text = hl.map(function(h, i) {
      return (i + 1) + ". " + h.selectedText + (h.comment ? "\n   → " + h.comment : "");
    }).join("\n\n");
    try { await navigator.clipboard.writeText(text); } catch (_e) {}
  }

  function _showExportMenu(anchor) {
    const existing = document.getElementById("ann-sb-export-popover");
    if (existing) { existing.remove(); return; }
    const pop = document.createElement("div");
    pop.id = "ann-sb-export-popover";
    pop.className = "ann-sb__export-popover";
    pop.innerHTML =
      '<p class="ann-sb__export-popover-title">Exportar esta página</p>' +
      '<button data-fmt="md">⬇ Markdown (.md)</button>' +
      '<button data-fmt="txt">⬇ Texto plano (.txt)</button>' +
      '<button data-fmt="json">⬇ JSON (.json)</button>' +
      '<hr style="border:none;border-top:1px solid rgba(0,0,0,0.1);margin:4px 0;">' +
      '<button data-fmt="all-md">⬇ Todos los resaltados (MD)</button>';

    pop.querySelectorAll("button[data-fmt]").forEach(function(btn) {
      btn.addEventListener("click", async function(e) {
        e.stopPropagation();
        pop.remove();
        if (btn.dataset.fmt === "all-md") await _exportAllMd();
        else await exportAs(btn.dataset.fmt);
      });
    });

    sidebarEl.appendChild(pop);
    // Prevent immediate close
    setTimeout(function() {
      document.addEventListener("click", function onClose() {
        pop.remove();
        document.removeEventListener("click", onClose);
      }, { once: true });
    }, 50);
  }

  async function _exportAllMd() {
    const data = await getStorage().exportAll();
    let content = "# Annotate — Todos los resaltados\nExportado: " + new Date().toLocaleString("es-ES") + "\n\n";
    const byUrl = {};
    (data.highlights || []).forEach(function(h) {
      if (!byUrl[h.url]) byUrl[h.url] = [];
      byUrl[h.url].push(h);
    });
    Object.keys(byUrl).forEach(function(url) {
      content += "## " + url + "\n\n";
      byUrl[url].forEach(function(h, i) {
        const cat = (ns.COLOR_OPTIONS.find(function(c) { return c.id === h.color; }) || {}).label || h.color;
        content += (i + 1) + ". **[" + cat + "]** " + h.selectedText + "\n";
        if (h.comment) content += "   > " + h.comment + "\n";
        if (h.tags && h.tags.length) content += "   *" + h.tags.join(", ") + "*\n";
        content += "\n";
      });
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "annotate-all-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ═══════════════════════════════════════════════════════════
  // FLASHCARDS
  // ═══════════════════════════════════════════════════════════

  let _fcCards   = [];
  let _fcIdx     = 0;
  let _fcFlipped = false;

  function initFlashcards() {
    document.getElementById("ann-sb-start-fc").addEventListener("click", async function() {
      const colorFilter = document.getElementById("ann-sb-fc-color").value;
      const mode        = document.getElementById("ann-sb-fc-mode").value;
      let hl = await getStorage().getHighlights(window.location.href);

      if (colorFilter !== "all") hl = hl.filter(function(h) { return h.color === colorFilter; });
      if (mode === "qa") {
        const withComment = hl.filter(function(h) { return h.comment && h.comment.trim(); });
        if (withComment.length) hl = withComment;
      }

      if (!hl.length) {
        const status = document.getElementById("ann-sb-fc-status");
        if (status) {
          status.textContent = "Sin resaltados" + (colorFilter !== "all" ? " con ese color" : "") +
            (mode === "qa" ? " con comentarios" : "") + ".";
          setTimeout(function() { status.textContent = ""; }, 2500);
        }
        return;
      }

      _fcCards   = hl.slice().sort(function() { return Math.random() - 0.5; });
      _fcIdx     = 0;
      _fcFlipped = false;

      document.getElementById("ann-sb-study-intro").hidden = true;
      document.getElementById("ann-sb-fc-area").hidden     = false;
      _renderCard();
    });

    document.getElementById("ann-sb-fc-stop").addEventListener("click", function() {
      document.getElementById("ann-sb-fc-area").hidden     = true;
      document.getElementById("ann-sb-study-intro").hidden = false;
    });

    document.getElementById("ann-sb-fc-flip").addEventListener("click", function() {
      _fcFlipped = !_fcFlipped;
      document.getElementById("ann-sb-fc-front").hidden = _fcFlipped;
      document.getElementById("ann-sb-fc-back").hidden  = !_fcFlipped;
      this.textContent = _fcFlipped ? "Ver pregunta ↩" : "Voltear ↩";
    });

    document.getElementById("ann-sb-fc-next").addEventListener("click", function() {
      if (_fcIdx < _fcCards.length - 1) { _fcIdx++; _renderCard(); }
    });

    document.getElementById("ann-sb-fc-prev").addEventListener("click", function() {
      if (_fcIdx > 0) { _fcIdx--; _renderCard(); }
    });

    // Keyboard navigation
    document.addEventListener("keydown", function(e) {
      if (!isOpen) return;
      const area = document.getElementById("ann-sb-fc-area");
      if (!area || area.hidden) return;
      if (e.key === "ArrowRight" || e.key === "l") { if (_fcIdx < _fcCards.length - 1) { _fcIdx++; _renderCard(); } }
      if (e.key === "ArrowLeft"  || e.key === "h") { if (_fcIdx > 0) { _fcIdx--; _renderCard(); } }
      if (e.key === " " || e.key === "f") {
        e.preventDefault();
        document.getElementById("ann-sb-fc-flip").click();
      }
    });
  }

  function _renderCard() {
    if (!_fcCards.length) return;
    _fcFlipped = false;

    const card     = _fcCards[_fcIdx];
    const mode     = document.getElementById("ann-sb-fc-mode").value;
    const total    = _fcCards.length;
    const frontEl  = document.getElementById("ann-sb-fc-front");
    const backEl   = document.getElementById("ann-sb-fc-back");
    const flipBtn  = document.getElementById("ann-sb-fc-flip");

    document.getElementById("ann-sb-fc-idx").textContent   = String(_fcIdx + 1);
    document.getElementById("ann-sb-fc-total").textContent = String(total);
    document.getElementById("ann-sb-fc-fill").style.width  = (100 * (_fcIdx + 1) / total) + "%";

    const colorLabel = (ns.COLOR_OPTIONS.find(function(c) { return c.id === card.color; }) || {}).label || card.color;

    if (mode === "qa" && card.comment && card.comment.trim()) {
      document.getElementById("ann-sb-fc-front-label").textContent = "Pregunta / Contexto:";
      document.getElementById("ann-sb-fc-front-text").textContent  = card.comment.trim();
      document.getElementById("ann-sb-fc-back-text").textContent   = card.selectedText;
    } else {
      document.getElementById("ann-sb-fc-front-label").textContent = colorLabel + " — ¿Recuerdas este texto?";
      document.getElementById("ann-sb-fc-front-text").textContent  =
        trunc(card.selectedText, 50).replace(/\S+/g, "████");
      document.getElementById("ann-sb-fc-back-text").textContent   = card.selectedText;
    }

    frontEl.hidden = false;
    backEl.hidden  = true;
    flipBtn.textContent = "Voltear ↩";

    // Animate card in
    const cardEl = document.getElementById("ann-sb-fc-card");
    cardEl.classList.remove("ann-sb__fc-card--pop");
    void cardEl.offsetWidth;
    cardEl.classList.add("ann-sb__fc-card--pop");
  }

  // ═══════════════════════════════════════════════════════════
  // OPEN / CLOSE / TOGGLE
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
  }

  function toggleSidebar() {
    if (isOpen) closeSidebar(); else openSidebar();
  }

  // ── FAB ───────────────────────────────────────────────────────────────────
  function buildFab() {
    if (document.getElementById("ann-fab")) return;
    const fab = document.createElement("button");
    fab.id        = "ann-fab";
    fab.className = "ann-fab";
    fab.title     = "Annotate – Abrir panel";
    fab.innerHTML = "✦";
    fab.addEventListener("click", toggleSidebar);
    document.documentElement.appendChild(fab);
  }

  // ── Messages from background/popup ───────────────────────────────────────
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === "TOGGLE_SIDEBAR")   toggleSidebar();
    if (msg.type === "OPEN_SIDEBAR")     openSidebar();
    if (msg.type === "CLOSE_SIDEBAR")    closeSidebar();
    if (msg.type === "REFRESH_SIDEBAR" && isOpen) loadData();
  });

  chrome.storage.onChanged.addListener(function() {
    if (isOpen) loadData();
  });

  buildFab();
})(globalThis);
