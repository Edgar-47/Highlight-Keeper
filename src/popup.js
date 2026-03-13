(function bootstrapPopup(global) {
  "use strict";
  const ns      = global.PersistentHighlighter;
  const storage = new ns.HighlightStorage();
  let currentTab = null;

  // ═══════════════════════════════════════════════════════════
  // UTILIDADES DE TAB / MENSAJERÍA
  // ═══════════════════════════════════════════════════════════

  function queryActiveTab() {
    return new Promise(function(resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        resolve(tabs[0]);
      });
    });
  }

  function sendMessage(message) {
    return new Promise(function(resolve, reject) {
      if (!currentTab || !currentTab.id) {
        return reject(new Error("No hay una pestaña activa disponible."));
      }
      chrome.tabs.sendMessage(currentTab.id, message, function(response) {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(response);
      });
    });
  }

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

  async function ensureTabReady() {
    if (!currentTab || !currentTab.id) throw new Error("No hay una pestaña activa disponible.");
    try {
      await sendMessage({ type: "RESTORE_HIGHLIGHTS" });
      await sendMessage({ type: "RESTORE_NOTES" });
    } catch (_e) {
      await injectIntoTab(currentTab.id);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS DOM
  // ═══════════════════════════════════════════════════════════

  function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error("Elemento no encontrado: " + id);
    return el;
  }

  function setStatus(elId, msg, isError) {
    try {
      const el = $(elId);
      el.textContent = msg;
      el.classList.toggle("status-line--error", Boolean(isError));
    } catch (_e) {}
  }

  // ═══════════════════════════════════════════════════════════
  // MODAL DE CONFIRMACIÓN
  // ═══════════════════════════════════════════════════════════

  function confirm(message) {
    return new Promise(function(resolve) {
      $("confirm-message").textContent = message;
      $("confirm-modal").hidden = false;
      function onOk()    { cleanup(); resolve(true);  }
      function onCancel(){ cleanup(); resolve(false); }
      function cleanup() {
        $("confirm-ok").removeEventListener("click", onOk);
        $("confirm-cancel").removeEventListener("click", onCancel);
        $("confirm-modal").hidden = true;
      }
      $("confirm-ok").addEventListener("click", onOk);
      $("confirm-cancel").addEventListener("click", onCancel);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // MODAL DE COMENTARIO
  // ═══════════════════════════════════════════════════════════

  function editComment(currentComment) {
    return new Promise(function(resolve) {
      $("comment-textarea").value = currentComment || "";
      $("comment-modal").hidden = false;
      $("comment-textarea").focus();
      function onSave()   { cleanup(); resolve($("comment-textarea").value.trim()); }
      function onCancel() { cleanup(); resolve(null); }
      function cleanup() {
        $("comment-save").removeEventListener("click", onSave);
        $("comment-cancel").removeEventListener("click", onCancel);
        $("comment-modal").hidden = true;
      }
      $("comment-save").addEventListener("click", onSave);
      $("comment-cancel").addEventListener("click", onCancel);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TABS
  // ═══════════════════════════════════════════════════════════

  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const tab = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("is-active"); });
        document.querySelectorAll(".tab-pane").forEach(function(p) { p.classList.remove("is-active"); });
        btn.classList.add("is-active");
        const pane = document.getElementById("tab-" + tab);
        if (pane) pane.classList.add("is-active");
        if (tab === "dashboard") renderDashboard();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // COLOR PICKERS
  // ═══════════════════════════════════════════════════════════

  function renderColorGrid(selectedColor) {
    const grid = $("color-grid");
    grid.innerHTML = "";
    ns.COLOR_OPTIONS.forEach(function(color) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-cell color-cell--" + color.id + (color.id === selectedColor ? " is-active" : "");
      btn.title = color.label;
      btn.dataset.color = color.id;
      btn.innerHTML = '<span class="color-cell__swatch"></span><span class="color-cell__label">' + ns.escapeHtml(color.label) + '</span>';
      btn.addEventListener("click", async function() {
        await storage.saveSettings({ selectedColor: color.id });
        renderColorGrid(color.id);
      });
      grid.appendChild(btn);
    });
    // custom cell
    const customBtn = document.createElement("button");
    customBtn.type = "button";
    customBtn.className = "color-cell" + (selectedColor === "custom" ? " is-active" : "");
    customBtn.title = "Personalizado";
    customBtn.dataset.color = "custom";
    customBtn.innerHTML = '<span class="color-cell__swatch color-cell__swatch--custom" id="custom-swatch-inline"></span><span class="color-cell__label">Custom</span>';
    customBtn.addEventListener("click", async function() {
      await storage.saveSettings({ selectedColor: "custom" });
      renderColorGrid("custom");
    });
    grid.appendChild(customBtn);
  }

  function renderNoteColorGrid(selectedColor) {
    const row = $("note-color-grid");
    row.innerHTML = "";
    ns.NOTE_COLOR_OPTIONS.forEach(function(color) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-swatch note-swatch--" + color.id + (color.id === selectedColor ? " is-active" : "");
      btn.title = color.label;
      btn.setAttribute("aria-label", color.label);
      btn.addEventListener("click", async function() {
        await storage.saveSettings({ noteColor: color.id });
        renderNoteColorGrid(color.id);
      });
      row.appendChild(btn);
    });
  }

  function updateCustomPreview(hex) {
    try { $("custom-color-preview").style.backgroundColor = ns.sanitizeColorHex(hex); } catch (_e) {}
    try {
      const inlineSwatch = document.getElementById("custom-swatch-inline");
      if (inlineSwatch) inlineSwatch.style.backgroundColor = ns.sanitizeColorHex(hex);
    } catch (_e) {}
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: HIGHLIGHT LIST (tab highlights)
  // ═══════════════════════════════════════════════════════════

  let hlFilter = "all";
  let hlSearch = "";

  function renderFilterChips(highlights) {
    const container = $("hl-filters");
    container.innerHTML = "";

    const counts = { all: highlights.length };
    ns.COLOR_OPTIONS.forEach(function(c) {
      const n = highlights.filter(function(h) { return h.color === c.id; }).length;
      if (n > 0) counts[c.id] = n;
    });
    if (highlights.some(function(h) { return h.isFavorite; })) counts["favorite"] = highlights.filter(function(h) { return h.isFavorite; }).length;

    function chip(id, label, count) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip" + (hlFilter === id ? " is-active" : "") + (id !== "all" && id !== "favorite" ? " filter-chip--" + id : "");
      btn.textContent = label + " " + count;
      btn.addEventListener("click", function() { hlFilter = id; renderHighlightList(highlights); renderFilterChips(highlights); });
      container.appendChild(btn);
    }

    chip("all", "Todos", counts.all);
    if (counts["favorite"]) chip("favorite", "⭐ Favoritos", counts["favorite"]);
    ns.COLOR_OPTIONS.forEach(function(c) {
      if (counts[c.id]) chip(c.id, c.circle + " " + c.label, counts[c.id]);
    });
  }

  function renderHighlightList(highlights) {
    const list = $("highlight-list");
    let filtered = highlights;

    if (hlFilter === "favorite") filtered = filtered.filter(function(h) { return h.isFavorite; });
    else if (hlFilter !== "all") filtered = filtered.filter(function(h) { return h.color === hlFilter; });

    if (hlSearch) {
      const q = hlSearch.toLowerCase();
      filtered = filtered.filter(function(h) {
        return h.selectedText.toLowerCase().includes(q) ||
               (h.comment || "").toLowerCase().includes(q) ||
               (h.tags || []).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }

    if (!filtered.length) {
      list.innerHTML = '<p class="empty-state">' + (hlSearch ? "Sin resultados para «" + ns.escapeHtml(hlSearch) + "»" : "No hay resaltados en esta página.") + '</p>';
      return;
    }

    list.innerHTML = "";
    filtered.forEach(function(record) {
      const row = document.createElement("div");
      row.className = "hl-row" + (record.isFavorite ? " hl-row--favorite" : "");
      const chipStyle = record.customColor ? ' style="background:' + record.customColor + '"' : "";
      const tagsHtml = (record.tags || []).map(function(t) {
        return '<span class="tag-chip">' + ns.escapeHtml(t) + '</span>';
      }).join("");
      const commentHtml = record.comment
        ? '<p class="hl-row__comment">' + ns.escapeHtml(record.comment) + '</p>'
        : "";

      row.innerHTML =
        '<div class="hl-row__left">' +
          '<span class="color-dot ' + (record.customColor ? "" : "color-dot--" + record.color) + '"' + chipStyle + '></span>' +
        '</div>' +
        '<div class="hl-row__body">' +
          '<p class="hl-row__text">' + ns.escapeHtml(ns.truncate(record.selectedText, 120)) + '</p>' +
          commentHtml +
          (tagsHtml ? '<div class="hl-row__tags">' + tagsHtml + '</div>' : '') +
          '<p class="hl-row__meta">' + ns.formatDate(record.createdAt) + '</p>' +
        '</div>' +
        '<div class="hl-row__actions">' +
          '<button class="icon-action" data-action="favorite" title="' + (record.isFavorite ? "Quitar favorito" : "Favorito") + '">' + (record.isFavorite ? "⭐" : "☆") + '</button>' +
          '<button class="icon-action" data-action="comment" title="Comentario">💬</button>' +
          '<button class="icon-action" data-action="delete" title="Eliminar">✕</button>' +
        '</div>';

      row.querySelector('[data-action="favorite"]').addEventListener("click", async function() {
        await storage.patchHighlight(currentTab.url, record.id, { isFavorite: !record.isFavorite });
        record.isFavorite = !record.isFavorite;
        await refreshHighlights();
      });

      row.querySelector('[data-action="comment"]').addEventListener("click", async function() {
        const result = await editComment(record.comment || "");
        if (result === null) return;
        await storage.patchHighlight(currentTab.url, record.id, { comment: result });
        await refreshHighlights();
      });

      row.querySelector('[data-action="delete"]').addEventListener("click", async function() {
        const ok = await confirm('¿Eliminar este resaltado?\n"' + ns.truncate(record.selectedText, 60) + '"');
        if (!ok) return;
        await storage.removeHighlight(currentTab.url, record.id);
        try { await sendMessage({ type: "REMOVE_HIGHLIGHT", highlightId: record.id }); } catch (_e) {}
        await refreshHighlights();
      });

      list.appendChild(row);
    });
  }

  async function refreshHighlights() {
    if (!currentTab) return;
    const highlights = await storage.getHighlights(currentTab.url);
    $("hl-count-badge").textContent = String(highlights.length);
    renderFilterChips(highlights);
    renderHighlightList(highlights);
    setStatus("hl-status", "Listo.");
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: NOTES LIST (tab notes)
  // ═══════════════════════════════════════════════════════════

  async function refreshNotes() {
    if (!currentTab) return;
    const notes = await storage.getNotes(currentTab.url);
    $("note-count-badge").textContent = String(notes.length);
    const list = $("note-list");

    if (!notes.length) {
      list.innerHTML = '<p class="empty-state">No hay notas en esta página.</p>';
      return;
    }

    list.innerHTML = "";
    notes.forEach(function(note) {
      const row = document.createElement("div");
      row.className = "note-row note-row--" + note.color;
      row.innerHTML =
        '<div class="note-row__body">' +
          '<p class="note-row__title">' + ns.escapeHtml(note.title || "Sin título") + '</p>' +
          (note.text ? '<p class="note-row__text">' + ns.escapeHtml(ns.truncate(note.text, 100)) + '</p>' : '') +
          '<p class="note-row__meta">' + ns.formatDate(note.updatedAt || note.createdAt) + '</p>' +
        '</div>' +
        '<div class="note-row__actions">' +
          '<button class="icon-action" data-action="delete" title="Eliminar">✕</button>' +
        '</div>';

      row.querySelector('[data-action="delete"]').addEventListener("click", async function() {
        const ok = await confirm('¿Eliminar la nota "' + ns.truncate(note.title || "Sin título", 40) + '"?');
        if (!ok) return;
        await storage.removeNote(currentTab.url, note.id);
        await refreshNotes();
      });

      list.appendChild(row);
    });
    setStatus("note-status", "Listo.");
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: DASHBOARD
  // ═══════════════════════════════════════════════════════════

  async function renderDashboard() {
    const summary   = $("page-summary");
    const dashList  = $("dashboard-list");

    if (!currentTab) {
      summary.innerHTML = '<p class="empty-state">Abre una página web.</p>';
      dashList.innerHTML = "";
      return;
    }

    const highlights = await storage.getHighlights(currentTab.url);
    const notes      = await storage.getNotes(currentTab.url);

    // Summary grid
    const colorCount = {};
    highlights.forEach(function(h) { colorCount[h.color] = (colorCount[h.color] || 0) + 1; });
    const colorDots = Object.keys(colorCount).map(function(c) {
      return '<span class="color-dot color-dot--' + c + '" title="' + c + '"></span> ' + colorCount[c];
    }).join(" &nbsp; ");

    summary.innerHTML =
      '<div class="summary-stat"><span class="summary-stat__num">' + highlights.length + '</span><span class="summary-stat__label">Resaltados</span></div>' +
      '<div class="summary-stat"><span class="summary-stat__num">' + notes.length + '</span><span class="summary-stat__label">Notas</span></div>' +
      '<div class="summary-stat summary-stat--wide"><span class="summary-stat__label">Colores</span><div class="summary-colors">' + (colorDots || '—') + '</div></div>';

    // Dashboard search
    const q = ($("dash-search").value || "").toLowerCase();
    const allH = q ? highlights.filter(function(h) {
      return h.selectedText.toLowerCase().includes(q) || (h.comment || "").toLowerCase().includes(q);
    }) : highlights;
    const allN = q ? notes.filter(function(n) {
      return (n.title || "").toLowerCase().includes(q) || (n.text || "").toLowerCase().includes(q);
    }) : notes;

    dashList.innerHTML = "";

    if (!allH.length && !allN.length) {
      dashList.innerHTML = '<p class="empty-state">Sin resultados.</p>';
      return;
    }

    if (allH.length) {
      const hdr = document.createElement("p");
      hdr.className = "section-label";
      hdr.textContent = "Resaltados (" + allH.length + ")";
      dashList.appendChild(hdr);
      allH.forEach(function(record) {
        const row = document.createElement("div");
        row.className = "hl-row";
        const chipStyle = record.customColor ? ' style="background:' + record.customColor + '"' : "";
        row.innerHTML =
          '<div class="hl-row__left"><span class="color-dot ' + (record.customColor ? "" : "color-dot--" + record.color) + '"' + chipStyle + '></span></div>' +
          '<div class="hl-row__body"><p class="hl-row__text">' + ns.escapeHtml(ns.truncate(record.selectedText, 100)) + '</p>' +
          (record.comment ? '<p class="hl-row__comment">' + ns.escapeHtml(record.comment) + '</p>' : '') +
          '<p class="hl-row__meta">' + ns.formatDate(record.createdAt) + '</p></div>';
        dashList.appendChild(row);
      });
    }

    if (allN.length) {
      const hdr2 = document.createElement("p");
      hdr2.className = "section-label";
      hdr2.style.marginTop = "12px";
      hdr2.textContent = "Notas (" + allN.length + ")";
      dashList.appendChild(hdr2);
      allN.forEach(function(note) {
        const row = document.createElement("div");
        row.className = "note-row note-row--" + note.color;
        row.innerHTML =
          '<div class="note-row__body"><p class="note-row__title">' + ns.escapeHtml(note.title || "Sin título") + '</p>' +
          (note.text ? '<p class="note-row__text">' + ns.escapeHtml(ns.truncate(note.text, 80)) + '</p>' : '') + '</div>';
        dashList.appendChild(row);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SETTINGS TAB
  // ═══════════════════════════════════════════════════════════

  function renderSettings() {
    // Categoría leyenda
    const legend = $("category-legend");
    legend.innerHTML = "";
    ns.COLOR_OPTIONS.forEach(function(c) {
      const li = document.createElement("li");
      li.innerHTML = '<span class="color-dot color-dot--' + c.id + '"></span> <strong>' + ns.escapeHtml(c.circle + " " + c.label) + '</strong>';
      legend.appendChild(li);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DARK MODE / READING MODE
  // ═══════════════════════════════════════════════════════════

  function applyDarkMode(enabled) {
    document.documentElement.setAttribute("data-theme", enabled ? "dark" : "light");
    $("btn-dark-mode").title = enabled ? "Modo claro" : "Modo oscuro";
    $("btn-dark-mode").textContent = enabled ? "☀" : "☽";
  }

  async function toggleDarkMode() {
    const s = await storage.getSettings();
    const next = !s.darkMode;
    await storage.saveSettings({ darkMode: next });
    applyDarkMode(next);
  }

  async function toggleReadingMode() {
    const s = await storage.getSettings();
    const next = !s.readingMode;
    await storage.saveSettings({ readingMode: next });
    $("btn-reading-mode").classList.toggle("is-active", next);
    // Envía señal a la pestaña para ocultar/mostrar las notas
    try { await sendMessage({ type: next ? "HIDE_NOTES" : "RESTORE_NOTES" }); } catch (_e) {}
  }

  // ═══════════════════════════════════════════════════════════
  // COPY
  // ═══════════════════════════════════════════════════════════

  async function copyHighlights() {
    if (!currentTab) return;
    const hl = await storage.getHighlights(currentTab.url);
    if (!hl.length) return setStatus("hl-status", "No hay resaltados para copiar.", true);
    const text = hl.map(function(h, i) {
      return (i + 1) + ". " + h.selectedText + (h.comment ? "\n   → " + h.comment : "");
    }).join("\n\n");
    await navigator.clipboard.writeText(text);
    setStatus("hl-status", "✓ " + hl.length + " resaltados copiados al portapapeles.");
  }

  async function copyNotes() {
    if (!currentTab) return;
    const notes = await storage.getNotes(currentTab.url);
    if (!notes.length) return setStatus("note-status", "No hay notas para copiar.", true);
    const text = notes.map(function(n, i) {
      return (i + 1) + ". [" + (n.title || "Sin título") + "]\n" + (n.text || "");
    }).join("\n\n---\n\n");
    await navigator.clipboard.writeText(text);
    setStatus("note-status", "✓ " + notes.length + " notas copiadas al portapapeles.");
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═══════════════════════════════════════════════════════════

  async function exportData() {
    const data = await storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "annotate-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("dash-status", "✓ Backup exportado.");
  }

  function importData(file, statusId) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const data = JSON.parse(e.target.result);
        const result = await storage.importAll(data);
        setStatus(statusId, "✓ Importados " + result.highlights + " resaltados y " + result.notes + " notas.");
        await refresh();
      } catch (err) {
        setStatus(statusId, "Error al importar: " + err.message, true);
      }
    };
    reader.readAsText(file);
  }

  // ═══════════════════════════════════════════════════════════
  // REFRESH GLOBAL
  // ═══════════════════════════════════════════════════════════

  async function refresh() {
    await refreshHighlights();
    await refreshNotes();
    if (!currentTab) {
      $("page-url").textContent = "Página no compatible";
      return;
    }
    $("page-url").textContent = currentTab.url;
  }

  // ═══════════════════════════════════════════════════════════
  // BOOTSTRAP
  // ═══════════════════════════════════════════════════════════

  async function bootstrap() {
    const tab = await queryActiveTab();
    if (tab && tab.id && tab.url && /^https?:/i.test(tab.url)) {
      currentTab = { id: tab.id, url: ns.normalizeUrl(tab.url) };
    }

    // Tabs
    initTabs();

    // Settings iniciales
    const settings = await storage.getSettings();
    renderColorGrid(settings.selectedColor);
    renderNoteColorGrid(settings.noteColor);
    updateCustomPreview(settings.customColor);
    applyDarkMode(settings.darkMode);
    $("btn-reading-mode").classList.toggle("is-active", settings.readingMode);
    $("custom-color-input").value = settings.customColor;
    renderSettings();

    // Custom color preview en vivo
    $("custom-color-input").addEventListener("input", function(e) {
      updateCustomPreview(e.target.value);
    });

    $("btn-use-custom").addEventListener("click", async function() {
      const hex = ns.sanitizeColorHex($("custom-color-input").value);
      $("custom-color-input").value = hex;
      updateCustomPreview(hex);
      await storage.saveSettings({ selectedColor: "custom", customColor: hex });
      renderColorGrid("custom");
    });

    // Highlight action
    $("btn-highlight").addEventListener("click", async function() {
      setStatus("hl-status", "Trabajando…");
      try {
        const s = await storage.getSettings();
        await ensureTabReady();
        const resp = await sendMessage({ type: "APPLY_HIGHLIGHT", color: s.selectedColor, customColor: s.customColor });
        if (!resp || !resp.ok) throw new Error(resp ? resp.error : "Sin respuesta.");
        await refresh();
      } catch (err) {
        setStatus("hl-status", err.message, true);
      }
    });

    // Nota desde selección
    $("btn-note-from-sel").addEventListener("click", async function() {
      setStatus("hl-status", "Trabajando…");
      try {
        const s = await storage.getSettings();
        await ensureTabReady();
        const resp = await sendMessage({ type: "CREATE_NOTE_FROM_SELECTION", color: s.noteColor });
        if (!resp || !resp.ok) throw new Error(resp ? resp.error : "Sin respuesta.");
        await refresh();
      } catch (err) {
        setStatus("hl-status", err.message, true);
      }
    });

    // Reaplicar
    $("btn-restore").addEventListener("click", async function() {
      setStatus("hl-status", "Trabajando…");
      try {
        await ensureTabReady();
        await refresh();
        setStatus("hl-status", "✓ Resaltados reaplicados.");
      } catch (err) {
        setStatus("hl-status", err.message, true);
      }
    });

    // Copiar resaltados
    $("btn-copy-highlights").addEventListener("click", copyHighlights);

    // Limpiar página
    $("btn-clear-page").addEventListener("click", async function() {
      const ok = await confirm("¿Eliminar todos los resaltados de esta página? Esta acción no se puede deshacer.");
      if (!ok) return;
      setStatus("hl-status", "Limpiando…");
      try {
        if (!currentTab) throw new Error("No hay pestaña activa.");
        await storage.clearHighlights(currentTab.url);
        try {
          await ensureTabReady();
          await sendMessage({ type: "CLEAR_HIGHLIGHTS" });
        } catch (_e) {}
        await refresh();
        setStatus("hl-status", "✓ Resaltados eliminados.");
      } catch (err) {
        setStatus("hl-status", err.message, true);
      }
    });

    // Buscar resaltados
    $("hl-search").addEventListener("input", function(e) {
      hlSearch = e.target.value.trim();
      refreshHighlights();
    });

    // Crear nota
    $("btn-create-note").addEventListener("click", async function() {
      setStatus("note-status", "Creando…");
      try {
        const s = await storage.getSettings();
        await ensureTabReady();
        const resp = await sendMessage({ type: "CREATE_NOTE", color: s.noteColor });
        if (!resp || !resp.ok) throw new Error(resp ? resp.error : "Sin respuesta.");
        await refreshNotes();
        setStatus("note-status", "✓ Nota creada.");
      } catch (err) {
        setStatus("note-status", err.message, true);
      }
    });

    // Copiar notas
    $("btn-copy-notes").addEventListener("click", copyNotes);

    // Dark mode
    $("btn-dark-mode").addEventListener("click", toggleDarkMode);

    // Reading mode
    $("btn-reading-mode").addEventListener("click", toggleReadingMode);

    // Dashboard search
    $("dash-search").addEventListener("input", renderDashboard);

    // Export / Import (dashboard tab)
    $("btn-export").addEventListener("click", exportData);
    $("btn-import").addEventListener("change", function(e) {
      importData(e.target.files[0], "dash-status");
      e.target.value = "";
    });

    // Export / Import (settings tab)
    $("btn-export-settings").addEventListener("click", exportData);
    $("btn-import-settings").addEventListener("change", function(e) {
      importData(e.target.files[0], "dash-status");
      e.target.value = "";
    });

    // Escuchar cambios de storage (por si otra pestaña modifica datos)
    chrome.storage.onChanged.addListener(function() { void refresh(); });

    await refresh();
  }

  void bootstrap().catch(function(err) {
    const st = document.getElementById("hl-status");
    if (st) st.textContent = err instanceof Error ? err.message : "Error al cargar.";
  });
})(globalThis);
