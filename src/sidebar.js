(function bootstrapSidebar(global) {
  "use strict";
  const ns = global.PersistentHighlighter;
  if (!ns) return;

  // ── Singleton guard ───────────────────────────────────────────────────────
  if (global.__annotateSidebarLoaded) return;
  global.__annotateSidebarLoaded = true;

  let sidebarEl = null;
  let isOpen = false;
  let storage = null;

  function getStorage() {
    if (!storage) storage = new ns.HighlightStorage();
    return storage;
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function colorDot(record) {
    const style = record.customColor ? ' style="background:' + record.customColor + '"' : "";
    const cls   = record.customColor ? "" : "ann-sdot--" + record.color;
    return '<span class="ann-sdot ' + cls + '"' + style + '></span>';
  }

  function escHtml(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function trunc(s, n) {
    s = String(s || "");
    return s.length <= n ? s : s.slice(0, n) + "…";
  }

  // ── Build sidebar DOM ─────────────────────────────────────────────────────
  function buildSidebar() {
    if (sidebarEl) return;

    const el = document.createElement("div");
    el.id = "ann-sidebar";
    el.className = "ann-sidebar ann-sidebar--closed";
    el.setAttribute("aria-label", "Annotate – Panel de resumen");
    el.innerHTML = `
      <div class="ann-sb__header">
        <span class="ann-sb__logo">✦</span>
        <span class="ann-sb__title">Annotate</span>
        <button class="ann-sb__close" id="ann-sb-close" title="Cerrar">✕</button>
      </div>

      <div class="ann-sb__tabs">
        <button class="ann-sb__tab is-active" data-tab="sb-highlights">◆ Resaltados <span id="ann-sb-hl-n" class="ann-sb__badge">0</span></button>
        <button class="ann-sb__tab" data-tab="sb-notes">□ Notas <span id="ann-sb-note-n" class="ann-sb__badge ann-sb__badge--soft">0</span></button>
        <button class="ann-sb__tab" data-tab="sb-study">🎓 Estudio</button>
      </div>

      <div class="ann-sb__search-row">
        <input id="ann-sb-search" type="search" placeholder="Buscar…" class="ann-sb__search" />
      </div>

      <!-- Highlights panel -->
      <div id="sb-highlights" class="ann-sb__panel is-active">
        <div id="ann-sb-filters" class="ann-sb__chips"></div>
        <div id="ann-sb-hl-list" class="ann-sb__list">
          <p class="ann-sb__empty">Cargando…</p>
        </div>
        <div class="ann-sb__footer-actions">
          <button id="ann-sb-export-md" class="ann-sb__pill">⬇ Markdown</button>
          <button id="ann-sb-export-txt" class="ann-sb__pill">⬇ TXT</button>
          <button id="ann-sb-copy-all" class="ann-sb__pill">📋 Copiar</button>
        </div>
      </div>

      <!-- Notes panel -->
      <div id="sb-notes" class="ann-sb__panel">
        <div id="ann-sb-note-list" class="ann-sb__list">
          <p class="ann-sb__empty">Sin notas en esta página.</p>
        </div>
      </div>

      <!-- Study / Flashcards panel -->
      <div id="sb-study" class="ann-sb__panel">
        <div class="ann-sb__study-intro">
          <p>Convierte tus resaltados en <strong>flashcards</strong>.</p>
          <div class="ann-sb__study-controls">
            <select id="ann-sb-fc-color" class="ann-sb__select">
              <option value="all">Todos los colores</option>
              <option value="green">🟢 Idea clave</option>
              <option value="blue">🔵 Info</option>
              <option value="purple">🟣 Duda</option>
              <option value="orange">🟠 Repasar</option>
              <option value="red">🔴 Importante</option>
              <option value="yellow">🟡 Amarillo</option>
            </select>
            <button id="ann-sb-start-fc" class="ann-sb__pill ann-sb__pill--primary">▶ Empezar</button>
          </div>
        </div>
        <div id="ann-sb-fc-area" class="ann-sb__fc-area" hidden>
          <div class="ann-sb__fc-progress">
            <span id="ann-sb-fc-idx">1</span> / <span id="ann-sb-fc-total">?</span>
          </div>
          <div id="ann-sb-fc-card" class="ann-sb__fc-card">
            <div class="ann-sb__fc-front" id="ann-sb-fc-front"></div>
            <div class="ann-sb__fc-back"  id="ann-sb-fc-back" hidden></div>
          </div>
          <div class="ann-sb__fc-btns">
            <button id="ann-sb-fc-flip"  class="ann-sb__pill ann-sb__pill--primary">Voltear</button>
            <button id="ann-sb-fc-prev"  class="ann-sb__pill">‹ Anterior</button>
            <button id="ann-sb-fc-next"  class="ann-sb__pill">Siguiente ›</button>
          </div>
          <button id="ann-sb-fc-stop" class="ann-sb__pill ann-sb__pill--ghost" style="margin-top:6px;width:100%">✕ Salir</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(el);
    sidebarEl = el;

    // Tab switching
    el.querySelectorAll(".ann-sb__tab").forEach(function(btn) {
      btn.addEventListener("click", function() {
        el.querySelectorAll(".ann-sb__tab").forEach(function(b) { b.classList.remove("is-active"); });
        el.querySelectorAll(".ann-sb__panel").forEach(function(p) { p.classList.remove("is-active"); });
        btn.classList.add("is-active");
        const panel = document.getElementById(btn.dataset.tab);
        if (panel) panel.classList.add("is-active");
      });
    });

    document.getElementById("ann-sb-close").addEventListener("click", closeSidebar);
    document.getElementById("ann-sb-search").addEventListener("input", function(e) {
      renderHighlights(e.target.value.trim());
    });

    document.getElementById("ann-sb-export-md").addEventListener("click", function() { exportAs("md"); });
    document.getElementById("ann-sb-export-txt").addEventListener("click", function() { exportAs("txt"); });
    document.getElementById("ann-sb-copy-all").addEventListener("click", copyAll);

    initFlashcards();
  }

  // ── Render highlights ─────────────────────────────────────────────────────
  let _highlights = [];
  let _hlFilter   = "all";

  async function loadData() {
    const s = getStorage();
    _highlights = await s.getHighlights(window.location.href);
    const notes = await s.getNotes(window.location.href);

    document.getElementById("ann-sb-hl-n").textContent   = String(_highlights.length);
    document.getElementById("ann-sb-note-n").textContent = String(notes.length);

    renderFilterChips();
    renderHighlights("");
    renderNotes(notes);
  }

  function renderFilterChips() {
    const container = document.getElementById("ann-sb-filters");
    if (!container) return;
    container.innerHTML = "";

    const counts = { all: _highlights.length };
    ns.COLOR_OPTIONS.forEach(function(c) {
      const n = _highlights.filter(function(h) { return h.color === c.id; }).length;
      if (n) counts[c.id] = n;
    });

    function chip(id, label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ann-sb__chip" + (_hlFilter === id ? " is-active" : "");
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
    if (_highlights.some(function(h) { return h.isFavorite; })) {
      chip("favorite", "⭐ " + _highlights.filter(function(h) { return h.isFavorite; }).length);
    }
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
        return h.selectedText.toLowerCase().includes(q) || (h.comment || "").toLowerCase().includes(q);
      });
    }

    if (!items.length) {
      list.innerHTML = '<p class="ann-sb__empty">' + (query ? "Sin resultados." : "Sin resaltados en esta página.") + '</p>';
      return;
    }

    list.innerHTML = "";
    items.forEach(function(h, i) {
      const row = document.createElement("div");
      row.className = "ann-sb__hl-row";
      row.innerHTML =
        colorDot(h) +
        '<div class="ann-sb__hl-body">' +
          '<p class="ann-sb__hl-num">' + (i + 1) + '.</p>' +
          '<p class="ann-sb__hl-text">' + escHtml(trunc(h.selectedText, 160)) + '</p>' +
          (h.comment ? '<p class="ann-sb__hl-comment">' + escHtml(trunc(h.comment, 80)) + '</p>' : "") +
          (h.tags && h.tags.length ? '<div class="ann-sb__tag-row">' + h.tags.map(function(t) {
            return '<span class="ann-sb__tag">' + escHtml(t) + '</span>';
          }).join("") + '</div>' : "") +
        '</div>';
      list.appendChild(row);
    });
  }

  function renderNotes(notes) {
    const list = document.getElementById("ann-sb-note-list");
    if (!list) return;
    if (!notes.length) {
      list.innerHTML = '<p class="ann-sb__empty">Sin notas en esta página.</p>';
      return;
    }
    list.innerHTML = "";
    notes.forEach(function(n) {
      const row = document.createElement("div");
      row.className = "ann-sb__note-row ann-sb__note-row--" + n.color;
      row.innerHTML =
        '<p class="ann-sb__note-title">' + escHtml(n.title || "Sin título") + '</p>' +
        (n.text ? '<p class="ann-sb__note-text">' + escHtml(trunc(n.text, 100)) + '</p>' : "");
      list.appendChild(row);
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function exportAs(fmt) {
    const s = getStorage();
    const hl = await s.getHighlights(window.location.href);
    const notes = await s.getNotes(window.location.href);
    let content = "";
    const url = window.location.href;
    const date = new Date().toLocaleString("es-ES");

    if (fmt === "md") {
      content = "# Resaltados — " + document.title + "\n\n";
      content += "> " + url + "  \n> Exportado: " + date + "\n\n";
      if (hl.length) {
        content += "## Resaltados\n\n";
        hl.forEach(function(h, i) {
          const colorLabel = (ns.COLOR_OPTIONS.find(function(c) { return c.id === h.color; }) || {}).label || h.color;
          content += (i + 1) + ". **[" + colorLabel + "]** " + h.selectedText + "\n";
          if (h.comment) content += "   > " + h.comment + "\n";
          if (h.tags && h.tags.length) content += "   *Tags: " + h.tags.join(", ") + "*\n";
          content += "\n";
        });
      }
      if (notes.length) {
        content += "## Notas\n\n";
        notes.forEach(function(n) {
          content += "### " + (n.title || "Sin título") + "\n\n" + (n.text || "") + "\n\n";
        });
      }
    } else {
      content = "RESALTADOS — " + document.title + "\n";
      content += url + "\nExportado: " + date + "\n\n";
      if (hl.length) {
        content += "=== RESALTADOS ===\n\n";
        hl.forEach(function(h, i) {
          content += (i + 1) + ". " + h.selectedText + "\n";
          if (h.comment) content += "   → " + h.comment + "\n";
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

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "annotate-" + new Date().toISOString().slice(0, 10) + "." + fmt;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyAll() {
    const s = getStorage();
    const hl = await s.getHighlights(window.location.href);
    if (!hl.length) return;
    const text = hl.map(function(h, i) {
      return (i + 1) + ". " + h.selectedText + (h.comment ? "\n   → " + h.comment : "");
    }).join("\n\n");
    await navigator.clipboard.writeText(text);
  }

  // ── Flashcards ────────────────────────────────────────────────────────────
  let _fcCards  = [];
  let _fcIdx    = 0;
  let _fcFlipped = false;

  function initFlashcards() {
    const startBtn  = document.getElementById("ann-sb-start-fc");
    const stopBtn   = document.getElementById("ann-sb-fc-stop");
    const flipBtn   = document.getElementById("ann-sb-fc-flip");
    const prevBtn   = document.getElementById("ann-sb-fc-prev");
    const nextBtn   = document.getElementById("ann-sb-fc-next");
    const intro     = sidebarEl.querySelector(".ann-sb__study-intro");
    const fcArea    = document.getElementById("ann-sb-fc-area");

    startBtn.addEventListener("click", async function() {
      const colorFilter = document.getElementById("ann-sb-fc-color").value;
      const s = getStorage();
      let hl = await s.getHighlights(window.location.href);
      if (colorFilter !== "all") hl = hl.filter(function(h) { return h.color === colorFilter; });
      if (!hl.length) {
        startBtn.textContent = "¡Sin resaltados con ese color!";
        setTimeout(function() { startBtn.textContent = "▶ Empezar"; }, 2000);
        return;
      }
      // Shuffle
      _fcCards = hl.slice().sort(function() { return Math.random() - 0.5; });
      _fcIdx   = 0;
      intro.hidden = true;
      fcArea.hidden = false;
      renderCard();
    });

    stopBtn.addEventListener("click", function() {
      fcArea.hidden = true;
      intro.hidden  = false;
    });

    flipBtn.addEventListener("click", function() {
      _fcFlipped = !_fcFlipped;
      const front = document.getElementById("ann-sb-fc-front");
      const back  = document.getElementById("ann-sb-fc-back");
      front.hidden = _fcFlipped;
      back.hidden  = !_fcFlipped;
      flipBtn.textContent = _fcFlipped ? "Ver pregunta" : "Voltear";
    });

    nextBtn.addEventListener("click", function() {
      if (_fcIdx < _fcCards.length - 1) { _fcIdx++; renderCard(); }
    });

    prevBtn.addEventListener("click", function() {
      if (_fcIdx > 0) { _fcIdx--; renderCard(); }
    });
  }

  function renderCard() {
    if (!_fcCards.length) return;
    _fcFlipped = false;
    const card  = _fcCards[_fcIdx];
    const front = document.getElementById("ann-sb-fc-front");
    const back  = document.getElementById("ann-sb-fc-back");
    const flip  = document.getElementById("ann-sb-fc-flip");

    document.getElementById("ann-sb-fc-idx").textContent   = String(_fcIdx + 1);
    document.getElementById("ann-sb-fc-total").textContent = String(_fcCards.length);

    // Front: show truncated text as question prompt
    front.innerHTML =
      '<p class="ann-sb__fc-label">¿Qué dice este fragmento?</p>' +
      '<p class="ann-sb__fc-hint">(' + escHtml((ns.COLOR_OPTIONS.find(function(c) { return c.id === card.color; }) || {}).label || card.color) + ')</p>';
    front.hidden = false;

    // Back: show full text + comment
    back.innerHTML =
      '<p class="ann-sb__fc-answer">' + escHtml(card.selectedText) + '</p>' +
      (card.comment ? '<p class="ann-sb__fc-comment">' + escHtml(card.comment) + '</p>' : "");
    back.hidden = true;

    flip.textContent = "Voltear";

    // Animate card
    const cardEl = document.getElementById("ann-sb-fc-card");
    cardEl.classList.remove("ann-sb__fc-card--flip");
    void cardEl.offsetWidth; // reflow
    cardEl.classList.add("ann-sb__fc-card--flip");
  }

  // ── Toggle open/close ─────────────────────────────────────────────────────
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

  // ── FAB trigger button ────────────────────────────────────────────────────
  function buildFab() {
    if (document.getElementById("ann-fab")) return;
    const fab = document.createElement("button");
    fab.id = "ann-fab";
    fab.className = "ann-fab";
    fab.title = "Annotate – Abrir panel";
    fab.innerHTML = "✦";
    fab.addEventListener("click", toggleSidebar);
    document.documentElement.appendChild(fab);
  }

  // ── Message handler ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === "TOGGLE_SIDEBAR") toggleSidebar();
    if (msg.type === "OPEN_SIDEBAR")   openSidebar();
    if (msg.type === "REFRESH_SIDEBAR" && isOpen) loadData();
  });

  // Listen for storage changes and refresh if open
  chrome.storage.onChanged.addListener(function() {
    if (isOpen) loadData();
  });

  buildFab();
})(globalThis);
