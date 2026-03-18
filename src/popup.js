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

  function resolveCurrentTab(tab) {
    if (!tab || !tab.id || !tab.url) return null;

    var pdfUrl = ns.extractPdfUrl(tab.url);
    if (pdfUrl) {
      return {
        id: tab.id,
        url: pdfUrl,
        tabUrl: tab.url,
        isPdf: true,
        isAnnotatePdfViewer: ns.isAnnotatePdfViewerUrl(tab.url)
      };
    }

    if (/^https?:/i.test(tab.url)) {
      return {
        id: tab.id,
        url: ns.normalizeUrl(tab.url),
        tabUrl: tab.url,
        isPdf: false,
        isAnnotatePdfViewer: false
      };
    }

    return null;
  }

  async function openPdfInAnnotateViewer() {
    if (!currentTab || !currentTab.id || !currentTab.isPdf) return false;
    var viewerUrl = ns.getAnnotatePdfViewerUrl(currentTab.url);
    await chrome.tabs.update(currentTab.id, { url: viewerUrl });
    currentTab.tabUrl = viewerUrl;
    currentTab.isAnnotatePdfViewer = true;
    return true;
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
      chrome.scripting.insertCSS({ target: { tabId }, files: ["src/styles.css", "src/sidebar.css"] }, function() {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ["src/types.js", "src/storage.js", "src/highlighter.js", "src/notes.js", "src/focus.js", "src/content.js", "src/sidebar.js"] },
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
    if (currentTab && currentTab.isPdf && !currentTab.isAnnotatePdfViewer) {
      await openPdfInAnnotateViewer();
      throw new Error("He abierto el PDF en el visor de Annotate. Espera a que cargue y vuelve a intentarlo.");
    }
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
    // Si el color seleccionado es extra (ex-*), ningún botón del grid principal queda activo
    const isExtra = selectedColor && selectedColor.startsWith("ex-");
    ns.COLOR_OPTIONS.forEach(function(color) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-cell color-cell--" + color.id + (!isExtra && color.id === selectedColor ? " is-active" : "");
      btn.title = color.label;
      btn.dataset.color = color.id;
      btn.innerHTML = '<span class="color-cell__swatch"></span><span class="color-cell__label">' + ns.escapeHtml(color.label) + '</span>';
      btn.addEventListener("click", async function() {
        await storage.saveSettings({ selectedColor: color.id });
        renderColorGrid(color.id);
        renderExtraColors(color.id); // deselect any extra swatch
      });
      grid.appendChild(btn);
    });
    // custom cell
    const customBtn = document.createElement("button");
    customBtn.type = "button";
    customBtn.className = "color-cell" + (!isExtra && selectedColor === "custom" ? " is-active" : "");
    customBtn.title = "Personalizado";
    customBtn.dataset.color = "custom";
    customBtn.innerHTML = '<span class="color-cell__swatch color-cell__swatch--custom" id="custom-swatch-inline"></span><span class="color-cell__label">Personalizado</span>';
    customBtn.addEventListener("click", async function() {
      await storage.saveSettings({ selectedColor: "custom" });
      renderColorGrid("custom");
      renderExtraColors("custom");
    });
    grid.appendChild(customBtn);
  }

  // ── Sección "Más colores" ──────────────────────────────────────────────────
  function renderExtraColors(selectedColor) {
    const panel = $("more-colors-panel");
    if (!panel) return;
    panel.innerHTML = "";

    // Agrupar colores por grupo
    const groups = {};
    ns.EXTRA_COLOR_OPTIONS.forEach(function(c) {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });

    Object.keys(groups).forEach(function(groupName) {
      const groupEl = document.createElement("div");
      groupEl.className = "extra-color-group";

      const label = document.createElement("p");
      label.className = "extra-color-group__label";
      label.textContent = groupName;
      groupEl.appendChild(label);

      const row = document.createElement("div");
      row.className = "extra-color-row";

      groups[groupName].forEach(function(color) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "extra-swatch" + (color.id === selectedColor ? " is-active" : "");
        btn.title = color.label;
        btn.dataset.color = color.id;
        btn.style.setProperty("--ex-color", color.hex);
        btn.addEventListener("click", async function() {
          await storage.saveSettings({ selectedColor: color.id });
          renderColorGrid(color.id);
          renderExtraColors(color.id);
        });
        row.appendChild(btn);
      });

      groupEl.appendChild(row);
      panel.appendChild(groupEl);
    });
  }

  // Toggle "Más colores"
  function initMoreColorsToggle() {
    const btn   = $("btn-more-colors");
    const panel = $("more-colors-panel");
    if (!btn || !panel) return;
    btn.addEventListener("click", async function() {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      btn.classList.toggle("is-open", !open);
      panel.hidden = open;
      if (!open) {
        const s = await storage.getSettings();
        renderExtraColors(s.selectedColor);
      }
    });
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
    if (counts["favorite"]) chip("favorite", "Favoritos", counts["favorite"]);
    ns.COLOR_OPTIONS.forEach(function(c) {
      if (counts[c.id]) chip(c.id, c.label, counts[c.id]);
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
      list.innerHTML = '<p class="empty-state">' + (hlSearch ? 'Sin resultados para "' + ns.escapeHtml(hlSearch) + '"' : "No hay resaltados en esta pagina.") + '</p>';
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
          '<button class="icon-action" data-action="favorite" title="' + (record.isFavorite ? "Quitar favorito" : "Marcar como favorito") + '">' + (record.isFavorite ? "Guardado" : "Favorito") + '</button>' +
          '<button class="icon-action" data-action="comment" title="Editar comentario">Comentario</button>' +
          '<button class="icon-action" data-action="delete" title="Eliminar">Eliminar</button>' +
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
        const ok = await confirm('Eliminar este resaltado?\n"' + ns.truncate(record.selectedText, 60) + '"');
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
      list.innerHTML = '<p class="empty-state">No hay notas en esta pagina.</p>';
      return;
    }

    list.innerHTML = "";
    notes.forEach(function(note) {
      const row = document.createElement("div");
      row.className = "note-row note-row--" + note.color;
      row.innerHTML =
        '<div class="note-row__body">' +
          '<p class="note-row__title">' + ns.escapeHtml(note.title || "Sin titulo") + '</p>' +
          (note.text ? '<p class="note-row__text">' + ns.escapeHtml(ns.truncate(note.text, 100)) + '</p>' : '') +
          '<p class="note-row__meta">' + ns.formatDate(note.updatedAt || note.createdAt) + '</p>' +
        '</div>' +
        '<div class="note-row__actions">' +
          '<button class="icon-action" data-action="delete" title="Eliminar">Eliminar</button>' +
        '</div>';

      row.querySelector('[data-action="delete"]').addEventListener("click", async function() {
        const ok = await confirm('Eliminar la nota "' + ns.truncate(note.title || "Sin titulo", 40) + '"?');
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
      summary.innerHTML = '<p class="empty-state">Abre una pagina web.</p>';
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
      '<div class="summary-stat summary-stat--wide"><span class="summary-stat__label">Colores</span><div class="summary-colors">' + (colorDots || 'Sin datos') + '</div></div>';

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
          '<div class="note-row__body"><p class="note-row__title">' + ns.escapeHtml(note.title || "Sin titulo") + '</p>' +
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
      li.innerHTML = '<span class="color-dot color-dot--' + c.id + '"></span> <strong>' + ns.escapeHtml(c.label) + '</strong>';
      legend.appendChild(li);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DARK MODE / READING MODE
  // ═══════════════════════════════════════════════════════════

  function applyDarkMode(enabled) {
    document.documentElement.setAttribute("data-theme", enabled ? "dark" : "light");
    $("btn-dark-mode").title = enabled ? "Modo claro" : "Modo oscuro";
    $("btn-dark-mode").classList.toggle("is-active", enabled);
    $("btn-dark-mode").setAttribute("aria-pressed", String(enabled));
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
    $("btn-reading-mode").setAttribute("aria-pressed", String(next));
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
      return (i + 1) + ". " + h.selectedText + (h.comment ? "\n   Comentario: " + h.comment : "");
    }).join("\n\n");
    await navigator.clipboard.writeText(text);
    setStatus("hl-status", hl.length + " resaltados copiados al portapapeles.");
  }

  async function copyNotes() {
    if (!currentTab) return;
    const notes = await storage.getNotes(currentTab.url);
    if (!notes.length) return setStatus("note-status", "No hay notas para copiar.", true);
    const text = notes.map(function(n, i) {
      return (i + 1) + ". [" + (n.title || "Sin titulo") + "]\n" + (n.text || "");
    }).join("\n\n---\n\n");
    await navigator.clipboard.writeText(text);
    setStatus("note-status", notes.length + " notas copiadas al portapapeles.");
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // TAB: ORGANIZE — Tags & Folders
  // ═══════════════════════════════════════════════════════════

  let orgSearch = "";
  let orgFilter = "all";

  async function initOrganize() {
    const tab = document.querySelector('[data-tab="organize"]');
    if (!tab) return;
    tab.addEventListener("click", refreshOrganize);

    $("btn-add-tag").addEventListener("click", async function() {
      const input = $("tag-input");
      const tag   = input.value.trim();
      if (!tag) return;
      input.value = "";
      await addGlobalTag(tag);
      await refreshOrganize();
    });

    $("tag-input").addEventListener("keydown", function(e) {
      if (e.key === "Enter") $("btn-add-tag").click();
    });

    $("org-search").addEventListener("input", function(e) {
      orgSearch = e.target.value.trim();
      refreshOrgList();
    });
  }

  async function getAllTags() {
    const s = await storage.getSettings();
    return Array.isArray(s.globalTags) ? s.globalTags : [];
  }

  async function addGlobalTag(tag) {
    const s = await storage.getSettings();
    const tags = Array.isArray(s.globalTags) ? s.globalTags : [];
    if (!tags.includes(tag)) tags.push(tag);
    await storage.saveSettings({ globalTags: tags });
  }

  async function removeGlobalTag(tag) {
    const s = await storage.getSettings();
    const tags = (Array.isArray(s.globalTags) ? s.globalTags : []).filter(function(t) { return t !== tag; });
    await storage.saveSettings({ globalTags: tags });
  }

  async function refreshTagCloud() {
    const tags    = await getAllTags();
    const cloud   = $("tag-cloud");
    cloud.innerHTML = "";

    if (!tags.length) {
      cloud.innerHTML = '<p style="font-size:12px;color:var(--ink-3);">Sin etiquetas aun.</p>';
      return;
    }

    tags.forEach(function(tag) {
      const chip = document.createElement("span");
      chip.className = "tag-chip tag-chip--manage" + (orgFilter === tag ? " is-active" : "");
      chip.innerHTML =
        '<span class="tag-chip__label">' + ns.escapeHtml(tag) + '</span>' +
        '<button class="tag-chip__del" data-tag="' + ns.escapeHtml(tag) + '" title="Eliminar etiqueta">Quitar</button>';

      chip.querySelector(".tag-chip__label").addEventListener("click", function() {
        orgFilter = (orgFilter === tag) ? "all" : tag;
        refreshTagCloud();
        refreshOrgList();
      });

      chip.querySelector(".tag-chip__del").addEventListener("click", async function() {
        await removeGlobalTag(tag);
        if (orgFilter === tag) orgFilter = "all";
        await refreshOrganize();
      });

      cloud.appendChild(chip);
    });

    // "Todos" chip
    const allChip = document.createElement("span");
    allChip.className = "tag-chip tag-chip--manage" + (orgFilter === "all" ? " is-active" : "");
    allChip.innerHTML = '<span class="tag-chip__label">Todos</span>';
    allChip.querySelector(".tag-chip__label").addEventListener("click", function() {
      orgFilter = "all";
      refreshTagCloud();
      refreshOrgList();
    });
    cloud.insertBefore(allChip, cloud.firstChild);
  }

  let _orgHighlights = [];

  async function refreshOrgList() {
    const list = $("org-hl-list");
    if (!currentTab) {
      list.innerHTML = '<p class="empty-state">Abre una pagina web.</p>';
      return;
    }

    let items = _orgHighlights.slice();

    if (orgFilter !== "all") {
      items = items.filter(function(h) { return (h.tags || []).includes(orgFilter); });
    }

    if (orgSearch) {
      const q = orgSearch.toLowerCase();
      items = items.filter(function(h) {
        return h.selectedText.toLowerCase().includes(q) ||
               (h.tags || []).some(function(t) { return t.toLowerCase().includes(q); });
      });
    }

    // Filter chips
    const chips = $("org-filter-chips");
    chips.innerHTML = "";
    const allTags = await getAllTags();
    if (allTags.length) {
      function fchip(id, label) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "filter-chip" + (orgFilter === id ? " is-active" : "");
        b.textContent = label;
        b.addEventListener("click", function() { orgFilter = id; refreshOrgList(); });
        chips.appendChild(b);
      }
      fchip("all", "Todos");
      fchip("untagged", "Sin tag");
      allTags.forEach(function(t) { fchip(t, t); });
    }

    if (!items.length) {
      list.innerHTML = '<p class="empty-state">Sin resaltados' + (orgFilter !== "all" ? ' con la etiqueta "' + ns.escapeHtml(orgFilter) + '"' : "") + '.</p>';
      return;
    }

    list.innerHTML = "";
    items.forEach(function(record) {
      const row = document.createElement("div");
      row.className = "hl-row";
      const chipStyle = record.customColor ? ' style="background:' + record.customColor + '"' : "";
      const tagsHtml  = (record.tags || []).map(function(t) {
        return '<span class="tag-chip">' + ns.escapeHtml(t) + '</span>';
      }).join("");
      row.innerHTML =
        '<div class="hl-row__left"><span class="color-dot ' + (record.customColor ? "" : "color-dot--" + record.color) + '"' + chipStyle + '></span></div>' +
        '<div class="hl-row__body">' +
          '<p class="hl-row__text">' + ns.escapeHtml(ns.truncate(record.selectedText, 100)) + '</p>' +
          (tagsHtml ? '<div class="hl-row__tags">' + tagsHtml + '</div>' : '<p class="hl-row__meta" style="font-style:italic;">Sin etiquetas</p>') +
        '</div>' +
        '<div class="hl-row__actions">' +
          '<button class="icon-action" data-action="edit-tags" title="Editar etiquetas">Etiquetas</button>' +
        '</div>';

      row.querySelector('[data-action="edit-tags"]').addEventListener("click", function() {
        openTagModal(record);
      });

      list.appendChild(row);
    });
  }

  async function refreshOrganize() {
    if (!currentTab) return;
    _orgHighlights = await storage.getHighlights(currentTab.url);
    await refreshTagCloud();
    await refreshOrgList();
  }

  // ── Tag editor modal ──────────────────────────────────────────────────────

  let _tagModalRecord = null;

  async function openTagModal(record) {
    _tagModalRecord = record;
    $("tag-modal-text").textContent = '"' + ns.truncate(record.selectedText, 60) + '"';
    $("tag-modal").hidden = false;
    $("tag-modal-input").value = "";
    $("tag-modal-input").focus();
    renderTagModalChips(record.tags || []);
  }

  function renderTagModalChips(tags) {
    const container = $("tag-modal-chips");
    container.innerHTML = "";
    tags.forEach(function(tag) {
      const chip = document.createElement("span");
      chip.className = "tag-chip tag-chip--manage";
      chip.innerHTML =
        '<span class="tag-chip__label">' + ns.escapeHtml(tag) + '</span>' +
        '<button class="tag-chip__del" title="Quitar">Quitar</button>';
      chip.querySelector(".tag-chip__del").addEventListener("click", async function() {
        const next = ((_tagModalRecord.tags || []).filter(function(t) { return t !== tag; }));
        _tagModalRecord = Object.assign({}, _tagModalRecord, { tags: next });
        await storage.patchHighlight(currentTab.url, _tagModalRecord.id, { tags: next });
        renderTagModalChips(next);
        await refreshOrganize();
      });
      container.appendChild(chip);
    });
    if (!tags.length) container.innerHTML = '<p style="font-size:12px;color:var(--ink-3);">Sin etiquetas.</p>';
  }

  async function addTagToModalRecord(tag) {
    if (!tag || !_tagModalRecord) return;
    const current = _tagModalRecord.tags || [];
    if (current.includes(tag)) return;
    const next = current.concat([tag]);
    _tagModalRecord = Object.assign({}, _tagModalRecord, { tags: next });
    await storage.patchHighlight(currentTab.url, _tagModalRecord.id, { tags: next });
    await addGlobalTag(tag);
    renderTagModalChips(next);
    await refreshOrganize();
  }

  function initTagModal() {
    $("tag-modal-close").addEventListener("click", function() { $("tag-modal").hidden = true; });
    $("tag-modal-add").addEventListener("click", async function() {
      const tag = $("tag-modal-input").value.trim();
      if (!tag) return;
      $("tag-modal-input").value = "";
      await addTagToModalRecord(tag);
    });
    $("tag-modal-input").addEventListener("keydown", function(e) {
      if (e.key === "Enter") $("tag-modal-add").click();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TAB: STUDY — Flashcards + Export
  // ═══════════════════════════════════════════════════════════

  let _fcCards  = [];
  let _fcIdx    = 0;
  let _fcFlipped = false;

  function initStudyTab() {
    const tab = document.querySelector('[data-tab="study"]');
    if (!tab) return;

    initFocusPanel();

    // Export buttons
    $("btn-export-md").addEventListener("click", function()        { exportFormatted("md"); });
    $("btn-export-txt").addEventListener("click", function()       { exportFormatted("txt"); });
    $("btn-export-json-page").addEventListener("click", function() { exportFormatted("json"); });
    $("btn-export-all-md").addEventListener("click", function()    { exportAll("md"); });
  }

  async function exportFormatted(fmt) {
    if (!currentTab) return setStatus("export-status", "Sin pagina activa.", true);
    const hl    = await storage.getHighlights(currentTab.url);
    const notes = await storage.getNotes(currentTab.url);
    const title = document.title || currentTab.url;
    const date  = new Date().toLocaleString("es-ES");
    let content = "";

    if (fmt === "md") {
      content  = "# " + title + "\n\n";
      content += "> " + currentTab.url + "\n> Exportado: " + date + "\n\n";
      if (hl.length) {
        content += "## Resaltados\n\n";
        hl.forEach(function(h, i) {
          const cat = (ns.COLOR_OPTIONS.find(function(c) { return c.id === h.color; }) || {}).label || h.color;
          content += (i + 1) + ". **[" + cat + "]** " + h.selectedText + "\n";
          if (h.comment) content += "   > Comentario: " + h.comment + "\n";
          if (h.tags && h.tags.length) content += "   *Etiquetas: " + h.tags.join(", ") + "*\n";
          content += "\n";
        });
      }
      if (notes.length) {
        content += "## Notas\n\n";
        notes.forEach(function(n) {
          content += "### " + (n.title || "Sin titulo") + "\n\n" + (n.text || "(vacia)") + "\n\n";
        });
      }
    } else if (fmt === "txt") {
      content  = title + "\n" + currentTab.url + "\nExportado: " + date + "\n\n";
      if (hl.length) {
        content += "=== RESALTADOS ===\n\n";
        hl.forEach(function(h, i) {
          content += (i + 1) + ". " + h.selectedText + "\n";
          if (h.comment) content += "   Comentario: " + h.comment + "\n";
          if (h.tags && h.tags.length) content += "   [" + h.tags.join(", ") + "]\n";
          content += "\n";
        });
      }
      if (notes.length) {
        content += "=== NOTAS ===\n\n";
        notes.forEach(function(n) {
          content += "[" + (n.title || "Sin titulo") + "]\n" + (n.text || "") + "\n\n";
        });
      }
    } else { // json
      content = JSON.stringify({ url: currentTab.url, exportedAt: date, highlights: hl, notes: notes }, null, 2);
    }

    const ext  = fmt === "json" ? "json" : (fmt === "md" ? "md" : "txt");
    const mime = fmt === "json" ? "application/json" : "text/plain";
    const blob = new Blob([content], { type: mime + ";charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "annotate-" + new Date().toISOString().slice(0, 10) + "." + ext;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("export-status", "Exportado como " + ext.toUpperCase() + ".");
  }

  async function exportAll(fmt) {
    const data = await storage.exportAll();
    let content = "# Annotate - Todos los resaltados\nExportado: " + new Date().toLocaleString("es-ES") + "\n\n";
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
        content += "\n";
      });
    });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "annotate-all-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("export-status", "Exportacion completa preparada.");
  }

  async function startFlashcards() {
    if (!currentTab) { setStatus("fc-status", "Sin pagina activa.", true); return; }
    const colorFilter = $("fc-color-filter").value;
    const mode        = $("fc-mode").value;
    let hl = await storage.getHighlights(currentTab.url);

    if (colorFilter !== "all") {
      hl = hl.filter(function(h) { return h.color === colorFilter; });
    }

    if (mode === "qa") {
      // In Q&A mode, only use items that have a comment (the comment becomes the "answer")
      const withComment = hl.filter(function(h) { return h.comment && h.comment.trim(); });
      if (withComment.length) hl = withComment;
    }

    if (!hl.length) {
      setStatus("fc-status", "No hay resaltados" + (colorFilter !== "all" ? " con ese color" : "") + (mode === "qa" ? " con comentarios" : "") + ".", true);
      return;
    }

    // Shuffle
    _fcCards  = hl.slice().sort(function() { return Math.random() - 0.5; });
    _fcIdx    = 0;
    _fcFlipped = false;

    $("fc-config").hidden = true;
    $("fc-active").hidden = false;
    showCard();
  }

  function stopFlashcards() {
    $("fc-active").hidden = true;
    $("fc-config").hidden = false;
    setStatus("fc-status", "");
  }

  function showCard() {
    if (!_fcCards.length) return;
    _fcFlipped = false;
    const card = _fcCards[_fcIdx];
    const mode = $("fc-mode").value;
    const total = _fcCards.length;

    $("fc-progress-text").textContent = (_fcIdx + 1) + " / " + total;
    $("fc-progress-fill").style.width = (100 * (_fcIdx + 1) / total) + "%";

    const frontText = document.getElementById("fc-front-text");
    const backText  = document.getElementById("fc-back-text");
    const frontLabel = document.getElementById("fc-front-label");
    const frontFace = document.getElementById("fc-card-front");
    const backFace  = document.getElementById("fc-card-back");

    if (mode === "qa" && card.comment) {
      frontLabel.textContent = "Pregunta";
      frontText.textContent  = card.comment.trim();
      backText.textContent   = card.selectedText;
    } else {
      const cat = (ns.COLOR_OPTIONS.find(function(c) { return c.id === card.color; }) || {}).label || card.color;
      frontLabel.textContent = cat + " - Recuerda el contenido";
      frontText.textContent  = ns.truncate(card.selectedText, 30).replace(/\S+/g, "_____");
      backText.textContent   = card.selectedText;
    }

    frontFace.hidden = false;
    backFace.hidden  = true;
    $("fc-btn-flip").textContent = "Mostrar respuesta";

    // Animate
    const cardEl = $("fc-card");
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }

  function flipCard() {
    _fcFlipped = !_fcFlipped;
    document.getElementById("fc-card-front").hidden = _fcFlipped;
    document.getElementById("fc-card-back").hidden  = !_fcFlipped;
    $("fc-btn-flip").textContent = _fcFlipped ? "Mostrar pregunta" : "Mostrar respuesta";
  }

  function clampInt(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(Math.max(Math.round(numeric), min), max);
  }

  function focusModeLabel(mode) {
    const labels = {
      stopwatch: "Cronometro",
      countdown: "Cuenta atras",
      breakCycle: "Ciclos de descanso"
    };
    return labels[mode] || "Temporizador";
  }

  function focusLayoutLabel(layout) {
    const labels = {
      stacked: "Aura",
      split: "Segmentado",
      minimal: "Minimal"
    };
    return labels[layout] || "Aura";
  }

  function cyclePhaseLabel(phase) {
    const labels = {
      focus: "Enfoque",
      break: "Descanso corto",
      longBreak: "Descanso largo"
    };
    return labels[phase] || "Enfoque";
  }

  function focusTimeSummary(state) {
    const now = Date.now();

    if (state.mode === "countdown") {
      const remaining = state.countdown.isRunning && state.countdown.endsAt
        ? Math.max(0, state.countdown.endsAt - now)
        : state.countdown.remainingMs;
      return Math.ceil(remaining / 60000) + " min";
    }

    if (state.mode === "breakCycle") {
      const cycle = state.breakCycle;
      const remaining = cycle.isRunning && cycle.endsAt
        ? Math.max(0, cycle.endsAt - now)
        : cycle.remainingMs;
      return cyclePhaseLabel(cycle.phase) + " · " + Math.ceil(remaining / 60000) + " min";
    }

    return "";
  }

  function buildFocusStatus(state) {
    if (!state.visible) {
      return focusModeLabel(state.mode) + " oculto. Se mostrara en la siguiente pagina compatible.";
    }

    if (state.mode === "stopwatch") {
      return state.stopwatch.isRunning ? "Cronometro corriendo en pantalla." : "Cronometro listo para arrancar.";
    }

    if (state.mode === "countdown") {
      return state.countdown.isRunning
        ? "Cuenta atras activa: " + focusTimeSummary(state) + "."
        : "Cuenta atras lista en " + state.countdown.durationMinutes + " min.";
    }

    const cycle = state[state.mode];
    return cycle.isRunning
      ? focusModeLabel(state.mode) + " activo: " + focusTimeSummary(state) + "."
      : focusModeLabel(state.mode) + " listo. " + cycle.focusMinutes + "/" + cycle.breakMinutes + " min.";
  }

  function renderFocusPanel(state) {
    const focusState = ns.normalizeFocusState(state);
    const isCountdown = focusState.mode === "countdown";
    const isBreak = focusState.mode === "breakCycle";

    $("focus-mode").value = focusState.mode;
    $("focus-layout").value = focusState.layout;
    $("focus-countdown-minutes").value = String(focusState.countdown.durationMinutes);
    $("focus-break-focus").value = String(focusState.breakCycle.focusMinutes);
    $("focus-break-rest").value = String(focusState.breakCycle.breakMinutes);
    $("focus-break-long").value = String(focusState.breakCycle.longBreakMinutes);
    $("focus-break-rounds").value = String(focusState.breakCycle.rounds);

    $("focus-countdown-fields").hidden = !isCountdown;
    $("focus-break-fields").hidden = !isBreak;

    $("btn-focus-toggle").textContent = focusState.visible ? "Ocultar de la pantalla" : "Mostrar en pantalla";
    $("btn-focus-run").textContent = focusState[focusState.mode].isRunning ? "Pausar" : "Empezar";
    $("btn-focus-reset").textContent = "Reset";
  }

  async function saveFocusPatch(patch, successMessage) {
    try {
      const nextState = await storage.saveFocusState(patch);
      renderFocusPanel(nextState);
      setStatus("focus-status", successMessage || buildFocusStatus(nextState));
      if (currentTab) {
        try {
          await ensureTabReady();
        } catch (_error) {}
      }
    } catch (err) {
      setStatus("focus-status", err.message, true);
    }
  }

  async function runFocusAction(action, payload) {
    try {
      if (!currentTab) throw new Error("Abre una pagina web compatible para usar el temporizador.");
      await ensureTabReady();
      const resp = await sendMessage({ type: "FOCUS_ACTION", action: action, payload: payload || {} });
      if (!resp || !resp.ok) throw new Error(resp ? resp.error : "Sin respuesta.");
      const nextState = resp.data && resp.data.focusState ? resp.data.focusState : await storage.getFocusState();
      renderFocusPanel(nextState);
      setStatus("focus-status", buildFocusStatus(nextState));
    } catch (err) {
      setStatus("focus-status", err.message, true);
    }
  }

  function initFocusPanel() {
    $("focus-mode").addEventListener("change", function(e) {
      if (currentTab) {
        runFocusAction("SET_MODE", { mode: e.target.value });
        return;
      }
      saveFocusPatch({ mode: e.target.value }, "Modo actualizado.");
    });

    $("focus-layout").addEventListener("change", function(e) {
      saveFocusPatch({ layout: e.target.value }, "Formato actualizado.");
    });

    $("focus-countdown-minutes").addEventListener("change", function(e) {
      saveFocusPatch({
        countdown: {
          durationMinutes: clampInt(e.target.value, 1, 600, 25),
          remainingMs: clampInt(e.target.value, 1, 600, 25) * 60 * 1000,
          endsAt: null,
          isRunning: false
        }
      }, "Cuenta atras ajustada.");
    });

    ["focus-break-focus", "focus-break-rest", "focus-break-long", "focus-break-rounds"].forEach(function(id) {
      $(id).addEventListener("change", function() {
        saveFocusPatch({
          breakCycle: {
            focusMinutes: clampInt($("focus-break-focus").value, 1, 600, 52),
            breakMinutes: clampInt($("focus-break-rest").value, 1, 180, 17),
            longBreakMinutes: clampInt($("focus-break-long").value, 1, 240, 30),
            rounds: clampInt($("focus-break-rounds").value, 1, 12, 4),
            currentRound: 1,
            phase: "focus",
            remainingMs: clampInt($("focus-break-focus").value, 1, 600, 52) * 60 * 1000,
            endsAt: null,
            isRunning: false
          }
        }, "Ciclo de descanso ajustado.");
      });
    });

    $("btn-focus-toggle").addEventListener("click", async function() {
      const state = await storage.getFocusState();
      await saveFocusPatch({ visible: !state.visible }, !state.visible ? "Temporizador visible." : "Temporizador oculto.");
    });

    $("btn-focus-run").addEventListener("click", async function() {
      await runFocusAction("TOGGLE_RUN");
    });

    $("btn-focus-reset").addEventListener("click", async function() {
      await runFocusAction("RESET_MODE");
    });

    $("btn-focus-center").addEventListener("click", function() {
      runFocusAction("CENTER");
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SIDEBAR TOGGLE (from popup)
  // ═══════════════════════════════════════════════════════════

  async function toggleSidebarOnPage() {
    if (!currentTab || !currentTab.id) return;
    if (currentTab.isPdf && !currentTab.isAnnotatePdfViewer) {
      await openPdfInAnnotateViewer();
      return;
    }
    try {
      await chrome.tabs.sendMessage(currentTab.id, { type: "TOGGLE_SIDEBAR" });
    } catch (_e) {
      try {
        await injectIntoTab(currentTab.id);
        await chrome.tabs.sendMessage(currentTab.id, { type: "TOGGLE_SIDEBAR" });
      } catch (err2) {
        console.error("Annotate: no se pudo abrir sidebar", err2);
      }
    }
  }

  async function exportData() {
    const data = await storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "annotate-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("dash-status", "Copia exportada.");
  }

  function importData(file, statusId) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const data = JSON.parse(e.target.result);
        const result = await storage.importAll(data);
        setStatus(statusId, "Importados " + result.highlights + " resaltados y " + result.notes + " notas.");
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
      $("page-url").textContent = "Pagina no compatible";
      return;
    }
    $("page-url").textContent = currentTab.url;
  }

  // ═══════════════════════════════════════════════════════════
  // BOOTSTRAP
  // ═══════════════════════════════════════════════════════════

  async function bootstrap() {
    const tab = await queryActiveTab();
    currentTab = resolveCurrentTab(tab);

    // Sidebar toggle
    try { $("btn-sidebar").addEventListener("click", toggleSidebarOnPage); } catch (_e) {}

    // Organize tab
    initOrganize();
    initTagModal();

    // Study tab
    initStudyTab();

    // Tabs (existing)
    initTabs();

    // Settings iniciales
    const settings = await storage.getSettings();
    renderColorGrid(settings.selectedColor);
    renderNoteColorGrid(settings.noteColor);
    updateCustomPreview(settings.customColor);
    applyDarkMode(settings.darkMode);
    $("btn-reading-mode").classList.toggle("is-active", settings.readingMode);
    $("btn-reading-mode").setAttribute("aria-pressed", String(settings.readingMode));
    $("custom-color-input").value = settings.customColor;
    renderSettings();
    initMoreColorsToggle();

    const focusState = await storage.getFocusState();
    renderFocusPanel(focusState);
    setStatus("focus-status", buildFocusStatus(focusState));

    // Si el color guardado es extra, abrir el panel automáticamente
    if (settings.selectedColor && settings.selectedColor.startsWith("ex-")) {
      const toggleBtn = $("btn-more-colors");
      const panel     = $("more-colors-panel");
      if (toggleBtn && panel) {
        toggleBtn.setAttribute("aria-expanded", "true");
        toggleBtn.classList.add("is-open");
        panel.hidden = false;
        renderExtraColors(settings.selectedColor);
      }
    }

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
      setStatus("hl-status", "Trabajando...");
      try {
        const s = await storage.getSettings();
        await ensureTabReady();
        // Resolver colores extra (ex-*) a custom + hex
        let finalColor = s.selectedColor;
        let finalCustom = s.customColor;
        if (finalColor && finalColor.startsWith("ex-")) {
          const extraOpt = ns.EXTRA_COLOR_OPTIONS.find(function(o) { return o.id === finalColor; });
          if (extraOpt) { finalCustom = extraOpt.hex; finalColor = "custom"; }
        }
        const resp = await sendMessage({ type: "APPLY_HIGHLIGHT", color: finalColor, customColor: finalCustom });
        if (!resp || !resp.ok) throw new Error(resp ? resp.error : "Sin respuesta.");
        await refresh();
      } catch (err) {
        setStatus("hl-status", err.message, true);
      }
    });

    // Nota desde seleccion
    $("btn-note-from-sel").addEventListener("click", async function() {
      setStatus("hl-status", "Trabajando...");
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
      setStatus("hl-status", "Trabajando...");
      try {
        await ensureTabReady();
        await refresh();
        setStatus("hl-status", "Resaltados reaplicados.");
      } catch (err) {
        setStatus("hl-status", err.message, true);
      }
    });

    // Copiar resaltados
    $("btn-copy-highlights").addEventListener("click", copyHighlights);

    // Limpiar pagina
    $("btn-clear-page").addEventListener("click", async function() {
      const ok = await confirm("Eliminar todos los resaltados de esta pagina? Esta accion no se puede deshacer.");
      if (!ok) return;
      setStatus("hl-status", "Limpiando...");
      try {
        if (!currentTab) throw new Error("No hay pestana activa.");
        await storage.clearHighlights(currentTab.url);
        try {
          await ensureTabReady();
          await sendMessage({ type: "CLEAR_HIGHLIGHTS" });
        } catch (_e) {}
        await refresh();
        setStatus("hl-status", "Resaltados eliminados.");
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
      setStatus("note-status", "Creando...");
      try {
        const s = await storage.getSettings();
        await ensureTabReady();
        const resp = await sendMessage({ type: "CREATE_NOTE", color: s.noteColor });
        if (!resp || !resp.ok) throw new Error(resp ? resp.error : "Sin respuesta.");
        await refreshNotes();
        setStatus("note-status", "Nota creada.");
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

    // Escuchar cambios de storage (por si otra pestana modifica datos)
    chrome.storage.onChanged.addListener(async function(changes) {
      void refresh();
      if (changes[ns.FOCUS_STORAGE_KEY]) {
        const nextState = await storage.getFocusState();
        renderFocusPanel(nextState);
        setStatus("focus-status", buildFocusStatus(nextState));
      }
    });

    await refresh();
  }

  void bootstrap().catch(function(err) {
    const st = document.getElementById("hl-status");
    if (st) st.textContent = err instanceof Error ? err.message : "Error al cargar.";
  });
})(globalThis);
