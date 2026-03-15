(function bootstrapHighlighter(global) {
  "use strict";
  var ns = global.PersistentHighlighter;

  // ─────────────────────────────────────────────────────────────────────────
  // HighlightRenderer
  // ─────────────────────────────────────────────────────────────────────────
  function HighlightRenderer(storage) {
    this.storage            = storage;
    this.mutationObserver   = null;
    this.restoreTimerId     = 0;
    this.restoreInFlight    = false;
    this.lastSelectionRange = null;
    this._tooltip           = null;
    this._initDeleteTooltip();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BOTÓN FLOTANTE DE ELIMINAR (hover sobre cualquier resaltado)
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype._initDeleteTooltip = function () {
    var self      = this;
    var btn       = document.createElement("button");
    btn.className = "ph-delete-tooltip";
    btn.innerHTML = "<span>✕</span> Eliminar";
    btn.style.display = "none";
    document.documentElement.appendChild(btn);
    this._tooltip = btn;

    var hideTimer   = null;
    var activeMark  = null;

    function place(mark) {
      clearTimeout(hideTimer);
      activeMark = mark;
      var rect       = mark.getBoundingClientRect();
      var scrollX    = window.scrollX;
      var scrollY    = window.scrollY;
      btn.style.display = "flex";
      btn.style.top  = (scrollY + rect.top - 34) + "px";
      btn.style.left = (scrollX + rect.left)      + "px";
    }

    function schedHide() {
      hideTimer = setTimeout(function () {
        btn.style.display = "none";
        activeMark = null;
      }, 250);
    }

    document.addEventListener("mouseover", function (e) {
      var mark = e.target && e.target.closest
        ? e.target.closest("." + ns.HIGHLIGHT_CLASS)
        : null;
      if (mark) place(mark);
    });

    document.addEventListener("mouseout", function (e) {
      var mark = e.target && e.target.closest
        ? e.target.closest("." + ns.HIGHLIGHT_CLASS)
        : null;
      if (mark && e.relatedTarget !== btn && !btn.contains(e.relatedTarget)) {
        schedHide();
      }
    });

    btn.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
    btn.addEventListener("mouseleave", schedHide);

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!activeMark) return;
      var id = activeMark.getAttribute(ns.HIGHLIGHT_ATTR);
      if (!id) return;
      btn.style.display = "none";
      activeMark = null;
      self.removeHighlightById(id);
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // APLICAR RESALTADO
  //   Escenario A – Texto completamente limpio → nuevo mark
  //   Escenario B – Selección dentro de UN mark (todo o parte) → recolor/split
  //   Escenario C – Selección cruza varios marks → unificar con nuevo color
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.applySelectionHighlight = async function (color, customColor) {
    var sel       = window.getSelection();
    var liveRange = (sel && sel.rangeCount > 0 && !sel.isCollapsed)
      ? sel.getRangeAt(0).cloneRange() : null;
    var range     = liveRange || (this.lastSelectionRange ? this.lastSelectionRange.cloneRange() : null);
    var selText   = ns.normalizeText(range ? range.toString() : "");

    if (!selText) throw new Error("Selecciona un texto antes de resaltar.");

    var resolvedCustom = color === "custom" ? ns.sanitizeColorHex(customColor) : undefined;
    if (sel) sel.removeAllRanges();

    // ── B: la selección cae completamente dentro de UN mark ──────────────
    var container = range ? this._containingMark(range) : null;
    if (container) {
      var cid = container.getAttribute(ns.HIGHLIGHT_ATTR);
      var recs = await this.storage.getHighlights(ns.getDocumentUrl());
      var rec  = recs.find(function (r) { return r.id === cid; });
      if (rec) {
        // B1: selección == mark completo → solo cambiar color
        if (this._coversFull(range, container)) {
          this._setColor(container, color, resolvedCustom);
          var upd = Object.assign({}, rec, { color: color, customColor: resolvedCustom });
          await this.storage.saveHighlight(upd);
          return upd;
        }
        // B2: selección parcial → dividir en 2 ó 3 marks
        return this._splitMark(container, rec, range, color, resolvedCustom);
      }
    }

    // ── C: selección que cruza varios marks → eliminarlos y crear uno nuevo
    var overlaps = this._overlappingMarks(range);
    if (overlaps.length > 0) {
      return this._mergeAndRecolor(range, overlaps, selText, color, resolvedCustom);
    }

    // ── A: texto limpio → nuevo mark ─────────────────────────────────────
    var record = this._buildRecord(range, selText, color,
      ns.getDocumentUrl(), resolvedCustom);
    this._wrap(range, record);
    await this.storage.saveHighlight(record);
    return record;
  };

  // ── Split: divide un mark en hasta 3 partes ───────────────────────────────
  HighlightRenderer.prototype._splitMark = async function (markEl, orig, selRange, newColor, newCustom) {
    var url    = ns.getDocumentUrl();
    var parent = markEl.parentNode;

    // Calcular los tres rangos: antes | selección | después
    var markRange = document.createRange();
    markRange.selectNodeContents(markEl);

    var beforeRange = null, afterRange = null;

    // Rango ANTES: desde inicio del mark hasta inicio de la selección
    if (markRange.startContainer !== selRange.startContainer ||
        markRange.startOffset    !== selRange.startOffset) {
      try {
        beforeRange = document.createRange();
        beforeRange.setStart(markRange.startContainer, markRange.startOffset);
        beforeRange.setEnd(selRange.startContainer, selRange.startOffset);
        if (beforeRange.collapsed || !ns.normalizeText(beforeRange.toString())) {
          beforeRange = null;
        }
      } catch (_e) { beforeRange = null; }
    }

    // Rango DESPUÉS: desde fin de la selección hasta fin del mark
    if (markRange.endContainer !== selRange.endContainer ||
        markRange.endOffset    !== selRange.endOffset) {
      try {
        afterRange = document.createRange();
        afterRange.setStart(selRange.endContainer, selRange.endOffset);
        afterRange.setEnd(markRange.endContainer, markRange.endOffset);
        if (afterRange.collapsed || !ns.normalizeText(afterRange.toString())) {
          afterRange = null;
        }
      } catch (_e) { afterRange = null; }
    }

    // Si no hay ni antes ni después: simplemente recolorear el mark completo
    if (!beforeRange && !afterRange) {
      this._setColor(markEl, newColor, newCustom);
      var u = Object.assign({}, orig, { color: newColor, customColor: newCustom });
      await this.storage.saveHighlight(u);
      return u;
    }

    // Extraer fragmentos en orden inverso para no invalidar los rangos
    var afterFrag  = afterRange  ? afterRange.extractContents()  : null;
    var midFrag    = selRange.extractContents();
    var beforeFrag = beforeRange ? beforeRange.extractContents() : null;

    // markEl ahora está vacío; usar como ancla de inserción
    var anchor = markEl;

    // Construir los nuevos marks en orden (antes → medio → después)
    var inserts  = [];
    var newRecs  = [];

    if (beforeFrag && ns.normalizeText(beforeFrag.textContent)) {
      var bRec  = this._cloneRec(orig, ns.normalizeText(beforeFrag.textContent));
      var bMark = this._makeMarkEl(bRec);
      bMark.appendChild(beforeFrag);
      inserts.push(bMark); newRecs.push(bRec);
    }

    var mRec  = this._cloneRec(orig, ns.normalizeText(midFrag.textContent), newColor, newCustom);
    mRec.createdAt = new Date().toISOString();
    var mMark = this._makeMarkEl(mRec);
    mMark.appendChild(midFrag);
    inserts.push(mMark); newRecs.push(mRec);

    if (afterFrag && ns.normalizeText(afterFrag.textContent)) {
      var aRec  = this._cloneRec(orig, ns.normalizeText(afterFrag.textContent));
      var aMark = this._makeMarkEl(aRec);
      aMark.appendChild(afterFrag);
      inserts.push(aMark); newRecs.push(aRec);
    }

    // Insertar antes del anchor (mark original vacío)
    for (var i = 0; i < inserts.length; i++) {
      parent.insertBefore(inserts[i], anchor);
    }
    // Eliminar el mark original vacío
    if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
    parent.normalize();

    // Actualizar storage
    await this.storage.removeHighlight(url, orig.id);
    for (var j = 0; j < newRecs.length; j++) {
      await this.storage.saveHighlight(newRecs[j]);
    }

    return mRec; // devolver el fragmento nuevo resaltado
  };

  // ── Merge: elimina marks solapados y crea uno nuevo ──────────────────────
  HighlightRenderer.prototype._mergeAndRecolor = async function (range, marks, selText, color, custom) {
    var url = ns.getDocumentUrl();
    for (var i = 0; i < marks.length; i++) {
      var id = marks[i].getAttribute(ns.HIGHLIGHT_ATTR);
      if (id) {
        this._unwrap(marks[i]);
        await this.storage.removeHighlight(url, id);
      }
    }
    var rec = this._buildRecord(range, selText, color, url, custom);
    try { this._wrap(range, rec); }
    catch (_e) {
      var r2 = this.findRangeForRecord(rec);
      if (r2) this._wrap(r2, rec);
    }
    await this.storage.saveHighlight(rec);
    return rec;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RECORDAR SELECCIÓN
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.rememberCurrentSelection = function () {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    var r = sel.getRangeAt(0).cloneRange();
    if (!ns.normalizeText(r.toString())) return;
    this.lastSelectionRange = r;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RESTAURAR
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.restoreHighlightsForCurrentPage = async function () {
    var records = await this.storage.getHighlights(ns.getDocumentUrl());
    var count   = 0;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (this.findHighlightElement(rec.id)) continue;
      var range = this.findRangeForRecord(rec);
      if (!range || range.collapsed) continue;
      try { this._wrap(range, rec); count++; } catch (_e) {}
    }
    return count;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ELIMINAR
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.removeHighlightById = async function (id) {
    var el = this.findHighlightElement(id);
    if (el) this._unwrap(el);
    await this.storage.removeHighlight(ns.getDocumentUrl(), id);
    return Boolean(el);
  };

  HighlightRenderer.prototype.clearCurrentPage = async function () {
    var self = this;
    var els  = Array.from(document.querySelectorAll("." + ns.HIGHLIGHT_CLASS));
    els.forEach(function (el) { self._unwrap(el); });
    await this.storage.clearHighlights(ns.getDocumentUrl());
    return els.length;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // OBSERVER
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.observeDynamicContent = function () {
    if (this.mutationObserver || !document.body) return;
    var self = this;
    this.mutationObserver = new MutationObserver(function (mutations) {
      var relevant = mutations.some(function (m) {
        if (m.type === "characterData") return !self.isInsideHighlight(m.target);
        return Array.from(m.addedNodes).some(function (n) { return !self.isInsideHighlight(n); });
      });
      if (!relevant || self.restoreInFlight) return;
      clearTimeout(self.restoreTimerId);
      self.restoreTimerId = setTimeout(async function () {
        self.restoreInFlight = true;
        try { await self.restoreHighlightsForCurrentPage(); }
        finally { self.restoreInFlight = false; }
      }, ns.DYNAMIC_RESTORE_DELAY_MS);
    });
    this.mutationObserver.observe(document.body, {
      childList: true, characterData: true, subtree: true
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ══════════════════════════════════════════════════════════════════════════

  // Devuelve el mark si el rango completo está dentro de él (un único mark)
  HighlightRenderer.prototype._containingMark = function (range) {
    var startMark = this.findHighlightElementForNode(range.startContainer);
    var endMark   = this.findHighlightElementForNode(range.endContainer);
    if (startMark && startMark === endMark) return startMark;
    // Caso: el ancestro común ES el mark
    var anc = range.commonAncestorContainer;
    var el  = anc.nodeType === Node.ELEMENT_NODE ? anc : anc.parentElement;
    return el ? el.closest("." + ns.HIGHLIGHT_CLASS) : null;
  };

  // True si el rango abarca todo el texto del elemento
  HighlightRenderer.prototype._coversFull = function (range, el) {
    return ns.normalizeText(range.toString()) === ns.normalizeText(el.textContent || "");
  };

  // Marks que se solapan con el rango
  HighlightRenderer.prototype._overlappingMarks = function (range) {
    return Array.from(document.querySelectorAll("." + ns.HIGHLIGHT_CLASS))
      .filter(function (m) { return range.intersectsNode(m); });
  };

  // Crear el elemento <mark> con clases y atributos
  HighlightRenderer.prototype._makeMarkEl = function (rec) {
    var m = document.createElement("mark");
    m.className = ns.HIGHLIGHT_CLASS + " " + ns.HIGHLIGHT_CLASS + "--" + rec.color;
    m.setAttribute(ns.HIGHLIGHT_ATTR, rec.id);
    m.setAttribute("data-ph-color", rec.color);
    if (rec.customColor) m.style.setProperty("--ph-custom-highlight", rec.customColor);
    return m;
  };

  // Clonar un record con nuevo id (y opcionalmente nuevo color/text)
  HighlightRenderer.prototype._cloneRec = function (orig, newText, newColor, newCustom) {
    return Object.assign({}, orig, {
      id:           ns.createId(),
      selectedText: newText !== undefined ? newText : orig.selectedText,
      color:        newColor !== undefined ? newColor : orig.color,
      customColor:  newCustom !== undefined ? newCustom : orig.customColor
    });
  };

  // Aplicar color a un element existente
  HighlightRenderer.prototype._setColor = function (el, color, custom) {
    var classes = ns.COLOR_OPTIONS.map(function (o) { return ns.HIGHLIGHT_CLASS + "--" + o.id; });
    classes.push(ns.HIGHLIGHT_CLASS + "--custom");
    el.classList.remove.apply(el.classList, classes);
    el.classList.add(ns.HIGHLIGHT_CLASS + "--" + color);
    el.setAttribute("data-ph-color", color);
    if (custom) el.style.setProperty("--ph-custom-highlight", custom);
    else el.style.removeProperty("--ph-custom-highlight");
  };

  // Envolver rango en un <mark>
  HighlightRenderer.prototype._wrap = function (range, record) {
    var mark = this._makeMarkEl(record);
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
    mark.normalize();
  };

  // Quitar el <mark> dejando el texto intacto
  HighlightRenderer.prototype._unwrap = function (el) {
    var p = el.parentNode;
    if (!p) return;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
    p.normalize();
  };

  // Construir el record de datos completo
  HighlightRenderer.prototype._buildRecord = function (range, selText, color, url, custom) {
    var prefix  = this.getContextSnippet(range, "prefix");
    var suffix  = this.getContextSnippet(range, "suffix");
    var domHint = this.getDomHint(range.commonAncestorContainer);
    return {
      id:             ns.createId(),
      url:            url,
      selectedText:   selText,
      color:          color,
      customColor:    custom,
      createdAt:      new Date().toISOString(),
      surroundingText: (prefix + selText + suffix).trim(),
      prefix:         prefix,
      suffix:         suffix,
      startXPath:     this.getXPathForNode(range.startContainer),
      endXPath:       this.getXPathForNode(range.endContainer),
      startOffset:    range.startOffset,
      endOffset:      range.endOffset,
      domHint:        domHint,
      signature:      ns.buildSignature(selText, prefix, suffix, domHint),
      comment:        "",
      tags:           [],
      isFavorite:     false,
      category:       (ns.COLOR_OPTIONS.find(function (o) { return o.id === color; }) || {}).category || "general"
    };
  };

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA (usada desde content.js, popup, storage)
  // ══════════════════════════════════════════════════════════════════════════

  HighlightRenderer.prototype.findHighlightElement = function (id) {
    return document.querySelector("[" + ns.HIGHLIGHT_ATTR + '="' + CSS.escape(id) + '"]');
  };

  HighlightRenderer.prototype.findHighlightElementForNode = function (node) {
    if (!node) return null;
    var el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el ? el.closest("." + ns.HIGHLIGHT_CLASS) : null;
  };

  HighlightRenderer.prototype.isInsideHighlight = function (node) {
    var el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(el && el.closest("." + ns.HIGHLIGHT_CLASS));
  };

  HighlightRenderer.prototype.unwrapHighlight = function (el) { this._unwrap(el); };
  HighlightRenderer.prototype.updateHighlightElementColor = function (el, c, cu) { this._setColor(el, c, cu); };

  // ── Buscar range para restaurar un record guardado ────────────────────────
  HighlightRenderer.prototype.findRangeForRecord = function (record) {
    // Intentar por XPath
    var r = this.tryRangeFromDescriptor(record);
    if (r) return r;
    // Búsqueda por texto
    var roots = this.getSearchRoots(record);
    for (var ri = 0; ri < roots.length; ri++) {
      var map = this.buildTextMap(roots[ri]);
      if (!map.text) continue;
      var idx = 0;
      while (idx < map.text.length) {
        var mi = map.text.indexOf(record.selectedText, idx);
        if (mi === -1) break;
        var ei  = mi + record.selectedText.length;
        var pre = map.text.slice(Math.max(0, mi - (record.prefix || "").length), mi);
        var suf = map.text.slice(ei, ei + (record.suffix || "").length);
        if (record.prefix && !pre.endsWith(record.prefix))   { idx = mi + 1; continue; }
        if (record.suffix && !suf.startsWith(record.suffix)) { idx = mi + 1; continue; }
        var range2 = this.createRangeFromOffsets(map.entries, mi, ei);
        if (range2 && ns.normalizeText(range2.toString()) === ns.normalizeText(record.selectedText)) {
          return range2;
        }
        idx = mi + 1;
      }
    }
    return null;
  };

  // Alias del viejo código (conservados para compat)
  HighlightRenderer.prototype.wrapRange = function (range, record) { this._wrap(range, record); };
  HighlightRenderer.prototype.createRecordFromRange = function (range, selText, color, url, custom) {
    return this._buildRecord(range, selText, color, url, custom);
  };
  HighlightRenderer.prototype.isRangeHighlightable = function (range) {
    // Ahora siempre aceptamos — el split/merge lo gestiona applySelectionHighlight
    return !this.isInsideHighlight(range.commonAncestorContainer) ||
           Boolean(this.findHighlightElementForNode(range.commonAncestorContainer));
  };

  // ── Helpers de búsqueda de texto (conservados) ────────────────────────────
  HighlightRenderer.prototype.tryRangeFromDescriptor = function (record) {
    if (!record.startXPath || !record.endXPath) return null;
    try {
      var sn = this.getNodeByXPath(record.startXPath);
      var en = this.getNodeByXPath(record.endXPath);
      if (!sn || !en) return null;
      var r = document.createRange();
      r.setStart(sn, Math.min(record.startOffset || 0, this.getNodeLength(sn)));
      r.setEnd(en,   Math.min(record.endOffset   || 0, this.getNodeLength(en)));
      return ns.normalizeText(r.toString()) === ns.normalizeText(record.selectedText) ? r : null;
    } catch (_e) { return null; }
  };

  HighlightRenderer.prototype.getSearchRoots = function (record) {
    var roots = [];
    if (record.domHint) {
      try { var h = document.querySelector(record.domHint); if (h) roots.push(h); } catch (_e) {}
    }
    if (record.startXPath) {
      var segs = record.startXPath.split("/"); segs.pop();
      var pp = segs.join("/");
      if (pp) { try { var pn = this.getNodeByXPath(pp); if (pn) roots.push(pn); } catch (_e) {} }
    }
    if (document.body && roots.indexOf(document.body) === -1) roots.push(document.body);
    return roots;
  };

  HighlightRenderer.prototype.buildTextMap = function (root) {
    var HL = ns.HIGHLIGHT_CLASS;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        var pe = node.parentElement;
        if (!pe) return NodeFilter.FILTER_REJECT;
        if (pe.closest("." + HL + ", script, style, noscript, textarea, input"))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var text = "", entries = [], cur = walker.nextNode();
    while (cur) {
      var s = text.length;
      text += cur.textContent || "";
      entries.push({ node: cur, start: s, end: text.length });
      cur = walker.nextNode();
    }
    return { text: text, entries: entries };
  };

  HighlightRenderer.prototype.createRangeFromOffsets = function (entries, si, ei) {
    var se = entries.find(function (e) { return si >= e.start && si <= e.end; });
    var ee = entries.find(function (e) { return ei >= e.start && ei <= e.end; });
    if (!se || !ee) return null;
    var r = document.createRange();
    r.setStart(se.node, si - se.start);
    r.setEnd(ee.node,   ei - ee.start);
    return r;
  };

  HighlightRenderer.prototype.getContextSnippet = function (range, side) {
    var node = side === "prefix" ? range.startContainer : range.endContainer;
    if (node.nodeType !== Node.TEXT_NODE) return "";
    var text = node.textContent || "";
    return side === "prefix"
      ? text.slice(Math.max(0, range.startOffset - 40), range.startOffset)
      : text.slice(range.endOffset, Math.min(text.length, range.endOffset + 40));
  };

  HighlightRenderer.prototype.getXPathForNode = function (node) {
    var target = node.nodeType === Node.TEXT_NODE ? node : (node.childNodes[0] || node);
    if (!target) return undefined;
    var segs = [], cur = target;
    while (cur && cur !== document) {
      if (cur.nodeType === Node.TEXT_NODE) {
        var tsibs = Array.from(cur.parentNode ? cur.parentNode.childNodes : [])
          .filter(function (s) { return s.nodeType === Node.TEXT_NODE; });
        segs.unshift("text()[" + (tsibs.indexOf(cur) + 1) + "]");
      } else if (cur.nodeType === Node.ELEMENT_NODE) {
        var esibs = Array.from(cur.parentNode ? cur.parentNode.children : [])
          .filter(function (s) { return s.tagName === cur.tagName; });
        segs.unshift(cur.tagName.toLowerCase() + "[" + (esibs.indexOf(cur) + 1) + "]");
      }
      cur = cur.parentNode;
    }
    return segs.length ? "/" + segs.join("/") : undefined;
  };

  HighlightRenderer.prototype.getNodeByXPath = function (xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  };

  HighlightRenderer.prototype.getParentNodeByXPath = function (xpath) {
    var segs = xpath.split("/"); segs.pop();
    var pp = segs.join("/");
    return pp ? this.getNodeByXPath(pp) : null;
  };

  HighlightRenderer.prototype.getNodeLength = function (node) {
    return node.nodeType === Node.TEXT_NODE ? (node.textContent || "").length : node.childNodes.length;
  };

  HighlightRenderer.prototype.getDomHint = function (node) {
    var el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return undefined;
    var target = el.closest("article, main, section, p, li, blockquote, div") || el;
    var id = target.getAttribute("id");
    if (id) return "#" + CSS.escape(id);
    var cls = Array.from(target.classList).slice(0, 3);
    if (cls.length) return target.tagName.toLowerCase() + "." + cls.map(CSS.escape).join(".");
    return target.tagName.toLowerCase();
  };

  ns.HighlightRenderer = HighlightRenderer;
})(globalThis);
