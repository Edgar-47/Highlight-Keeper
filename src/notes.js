(function bootstrapNotes(global) {
  "use strict";
  var ns = global.PersistentHighlighter;

  function NotesBoard(storage) {
    this.storage         = storage;
    this.container       = null;
    this.noteElements    = new Map();
    this.saveTimers      = new Map();
    this.resizeObservers = new Map();
  }

  NotesBoard.prototype.createNote = async function (color) {
    this._ensureContainer();
    var note = this._buildNewNote(color);
    this._renderNote(note);
    await this.storage.saveNote(note);
    return note;
  };

  NotesBoard.prototype.createNoteFromText = async function (color, text) {
    this._ensureContainer();
    var note = this._buildNewNote(color);
    note.text  = text || "";
    note.title = text ? text.slice(0, 50) : "";
    this._renderNote(note);
    await this.storage.saveNote(note);
    return note;
  };

  NotesBoard.prototype.restoreNotesForCurrentPage = async function () {
    this._ensureContainer();
    var notes = await this.storage.getNotes(ns.getDocumentUrl());
    var restored = 0;
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      if (this.noteElements.has(note.id)) continue;
      this._renderNote(this._normalize(this._clamp(note)));
      restored++;
    }
    return restored;
  };

  NotesBoard.prototype.observeViewport = function () {
    window.addEventListener("resize", function () {
      this._syncBounds();
      this.noteElements.forEach(function (el, id) {
        var n = this._readFromEl(el, id);
        var c = this._clamp(n);
        this._applyLayout(el, c);
        this._scheduleSave(c);
      }.bind(this));
    }.bind(this));
  };

  // Centrada en viewport
  NotesBoard.prototype._buildNewNote = function (color) {
    var W  = 300, H = 260;
    var off = this.noteElements.size * 28;
    var x  = window.scrollX + Math.round((window.innerWidth  - W) / 2) + off;
    var y  = window.scrollY + Math.round((window.innerHeight - H) / 2) + off;
    var ts = new Date().toISOString();
    return {
      id: ns.createNoteId(), url: ns.getDocumentUrl(),
      title: "", text: "", color: color, customColor: undefined,
      x: x, y: y, width: W, height: H,
      isMinimized: false, isFavorite: false, tags: [],
      createdAt: ts, updatedAt: ts
    };
  };

  NotesBoard.prototype._renderNote = function (note) {
    var self = this;
    var container = this._ensureContainer();
    var el = document.createElement("article");
    el.className = "ph-note";
    el.dataset.noteId    = note.id;
    el.dataset.createdAt = note.createdAt;

    el.innerHTML =
      '<div class="ph-note__bar">' +
        '<span class="ph-note__grip">&#8942;&#8942;</span>' +
        '<input class="ph-note__title" type="text" placeholder="Título…" maxlength="60" autocomplete="off" spellcheck="false" />' +
        '<div class="ph-note__btns">' +
          '<button class="ph-note__btn" data-action="minimize" title="Minimizar">&#8211;</button>' +
          '<button class="ph-note__btn ph-note__btn--del" data-action="delete" title="Eliminar">&#10005;</button>' +
        '</div>' +
      '</div>' +
      '<div class="ph-note__colors"></div>' +
      '<textarea class="ph-note__body" placeholder="Escribe tu nota…"></textarea>';

    // Título
    var titleEl = el.querySelector(".ph-note__title");
    titleEl.value = note.title || "";
    titleEl.addEventListener("input", function () {
      self._scheduleSave(Object.assign({}, self._readFromEl(el, note.id), {
        title: titleEl.value, updatedAt: new Date().toISOString()
      }));
    });

    // Textarea
    var textEl = el.querySelector(".ph-note__body");
    textEl.value = note.text || "";
    textEl.addEventListener("input", function () {
      self._scheduleSave(Object.assign({}, self._readFromEl(el, note.id), {
        text: textEl.value, updatedAt: new Date().toISOString()
      }));
    });

    // Paleta
    var paletteEl = el.querySelector(".ph-note__colors");
    ns.NOTE_COLOR_OPTIONS.forEach(function (opt) {
      var sw = document.createElement("button");
      sw.type = "button";
      sw.className = "ph-note__swatch ph-note__swatch--" + opt.id;
      sw.title = opt.label;
      sw.addEventListener("click", function () {
        var next = Object.assign({}, self._readFromEl(el, note.id), {
          color: opt.id, customColor: undefined, updatedAt: new Date().toISOString()
        });
        el.dataset.customColor = "";
        el.style.removeProperty("--ph-note-bg");
        self._applyColor(el, next);
        self._scheduleSave(next);
      });
      paletteEl.appendChild(sw);
    });

    var sep = document.createElement("span");
    sep.className = "ph-note__sep";
    paletteEl.appendChild(sep);

    var wheel = document.createElement("input");
    wheel.type = "color";
    wheel.className = "ph-note__wheel";
    wheel.title = "Color personalizado";
    wheel.value = note.customColor || "#fffb8f";
    wheel.addEventListener("input", function () {
      var hex = wheel.value;
      var next = Object.assign({}, self._readFromEl(el, note.id), {
        color: "custom", customColor: hex, updatedAt: new Date().toISOString()
      });
      el.style.setProperty("--ph-note-bg", hex);
      el.dataset.customColor = hex;
      el.dataset.color = "custom";
      self._clearColorClasses(el);
      self._scheduleSave(next);
    });
    paletteEl.appendChild(wheel);

    // Eliminar
    el.querySelector('[data-action="delete"]').addEventListener("click", async function () {
      el.classList.add("ph-note--removing");
      window.clearTimeout(self.saveTimers.get(note.id));
      self.saveTimers.delete(note.id);
      setTimeout(function () { el.remove(); }, 220);
      self.noteElements.delete(note.id);
      self._disconnectResize(note.id);
      await self.storage.removeNote(ns.getDocumentUrl(), note.id);
    });

    // Minimizar
    el.querySelector('[data-action="minimize"]').addEventListener("click", function () {
      var next = Object.assign({}, self._readFromEl(el, note.id), {
        isMinimized: !el.classList.contains("ph-note--minimized"),
        updatedAt: new Date().toISOString()
      });
      self._applyLayout(el, next);
      self._scheduleSave(next);
    });

    // Drag desde la barra
    var bar = el.querySelector(".ph-note__bar");
    bar.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest("button, input")) return;
      ev.preventDefault();
      bar.setPointerCapture(ev.pointerId);
      var sx = Number(el.dataset.x) || 0;
      var sy = Number(el.dataset.y) || 0;
      var ox = ev.pageX, oy = ev.pageY;
      el.classList.add("ph-note--dragging");

      function onMove(mv) {
        var c = self._clamp(Object.assign({}, self._readFromEl(el, note.id), {
          x: sx + mv.pageX - ox, y: sy + mv.pageY - oy
        }));
        el.style.left = c.x + "px";
        el.style.top  = c.y + "px";
        el.dataset.x  = String(c.x);
        el.dataset.y  = String(c.y);
      }
      function onUp() {
        bar.removeEventListener("pointermove",   onMove);
        bar.removeEventListener("pointerup",     onUp);
        bar.removeEventListener("pointercancel", onUp);
        el.classList.remove("ph-note--dragging");
        self._scheduleSave(Object.assign({}, self._readFromEl(el, note.id), {
          updatedAt: new Date().toISOString()
        }));
      }
      bar.addEventListener("pointermove",   onMove);
      bar.addEventListener("pointerup",     onUp);
      bar.addEventListener("pointercancel", onUp);
    });

    container.appendChild(el);
    this.noteElements.set(note.id, el);
    this._applyLayout(el, note);
    this._watchResize(el, note.id);
  };

  NotesBoard.prototype._applyLayout = function (el, note) {
    var c = this._clamp(note);
    this._syncBounds();
    el.style.left   = c.x + "px";
    el.style.top    = c.y + "px";
    el.style.width  = c.width + "px";
    el.style.height = c.isMinimized ? "38px" : (c.height + "px");
    el.dataset.x         = String(c.x);
    el.dataset.y         = String(c.y);
    el.dataset.width     = String(c.width);
    el.dataset.height    = String(c.height);
    el.dataset.color     = c.color;
    el.dataset.minimized = String(c.isMinimized);
    el.dataset.favorite  = String(Boolean(c.isFavorite));
    el.classList.toggle("ph-note--minimized", c.isMinimized);
    this._applyColor(el, c);
  };

  NotesBoard.prototype._applyColor = function (el, note) {
    this._clearColorClasses(el);
    if (note.color === "custom" && note.customColor) {
      el.style.setProperty("--ph-note-bg", note.customColor);
      el.dataset.customColor = note.customColor;
      var w = el.querySelector(".ph-note__wheel");
      if (w) w.value = note.customColor;
    } else {
      el.style.removeProperty("--ph-note-bg");
      el.dataset.customColor = "";
      el.classList.add("ph-note--" + note.color);
    }
  };

  NotesBoard.prototype._clearColorClasses = function (el) {
    ["yellow","pink","blue","green","orange","purple","custom"].forEach(function (c) {
      el.classList.remove("ph-note--" + c);
    });
  };

  NotesBoard.prototype._readFromEl = function (el, id) {
    var t = el.querySelector(".ph-note__title");
    var b = el.querySelector(".ph-note__body");
    return this._normalize({
      id:          id,
      url:         ns.getDocumentUrl(),
      title:       t ? t.value : "",
      text:        b ? b.value : "",
      color:       el.dataset.color       || "yellow",
      customColor: el.dataset.customColor || undefined,
      x:           Number(el.dataset.x)   || 0,
      y:           Number(el.dataset.y)   || 0,
      width:       Number(el.dataset.width)  || 300,
      height:      Number(el.dataset.height) || 260,
      isMinimized: el.dataset.minimized === "true",
      isFavorite:  el.dataset.favorite  === "true",
      tags: [],
      createdAt:   el.dataset.createdAt || new Date().toISOString(),
      updatedAt:   new Date().toISOString()
    });
  };

  NotesBoard.prototype._scheduleSave = function (note) {
    var self = this;
    window.clearTimeout(self.saveTimers.get(note.id));
    self.saveTimers.set(note.id, window.setTimeout(function () {
      self.storage.saveNote(self._clamp(note));
    }, 200));
  };

  NotesBoard.prototype._clamp = function (note) {
    var minVis = 60;
    var dw = Math.max(document.documentElement.scrollWidth,  window.innerWidth);
    var dh = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    var w  = Math.max(220, Math.min(note.width,  dw - 24));
    var h  = Math.max(150, Math.min(note.height, dh - 24));
    return Object.assign({}, note, {
      x: Math.max(minVis - w, Math.min(note.x, dw - minVis)),
      y: Math.max(8,          Math.min(note.y, dh - minVis)),
      width: w, height: h
    });
  };

  NotesBoard.prototype._normalize = function (note) {
    var cx = window.scrollX + Math.round((window.innerWidth  - 300) / 2);
    var cy = window.scrollY + Math.round((window.innerHeight - 260) / 2);
    return Object.assign({}, note, {
      title:       String(note.title || ""),
      text:        note.text || "",
      color:       note.color || "yellow",
      customColor: note.customColor || undefined,
      width:  Number.isFinite(note.width)  ? note.width  : 300,
      height: Number.isFinite(note.height) ? note.height : 260,
      x: Number.isFinite(note.x) ? note.x : cx,
      y: Number.isFinite(note.y) ? note.y : cy
    });
  };

  NotesBoard.prototype._ensureContainer = function () {
    if (this.container && this.container.isConnected) {
      this._syncBounds();
      return this.container;
    }
    var div = document.createElement("div");
    div.className = "ph-note-layer";
    document.documentElement.appendChild(div);
    this.container = div;
    this._syncBounds();
    return div;
  };

  NotesBoard.prototype._syncBounds = function () {
    if (!this.container) return;
    var w = Math.max(document.documentElement.scrollWidth,  window.innerWidth);
    var h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    this.container.style.width  = w + "px";
    this.container.style.height = h + "px";
  };

  NotesBoard.prototype._watchResize = function (el, id) {
    if (typeof ResizeObserver === "undefined") return;
    var self = this;
    var obs = new ResizeObserver(function () {
      self._scheduleSave(Object.assign({}, self._readFromEl(el, id), {
        updatedAt: new Date().toISOString()
      }));
    });
    obs.observe(el);
    this.resizeObservers.set(id, obs);
  };

  NotesBoard.prototype._disconnectResize = function (id) {
    if (this.resizeObservers.has(id)) {
      this.resizeObservers.get(id).disconnect();
      this.resizeObservers.delete(id);
    }
  };

  ns.NotesBoard = NotesBoard;
})(globalThis);
