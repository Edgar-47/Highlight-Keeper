(function bootstrapNotes(global) {
  const namespace = global.PersistentHighlighter;

  function NotesBoard(storage) {
    this.storage = storage;
    this.container = null;
    this.noteElements = new Map();
    this.saveTimers = new Map();
    this.resizeObservers = new Map();
  }

  NotesBoard.prototype.createNote = async function createNote(color) {
    this.ensureContainer();
    const note = this.buildNewNote(color);
    this.renderNote(note);
    await this.storage.saveNote(note);
    return note;
  };

  NotesBoard.prototype.restoreNotesForCurrentPage = async function restoreNotesForCurrentPage() {
    this.ensureContainer();
    const notes = await this.storage.getNotes(window.location.href);
    let restoredCount = 0;

    for (const note of notes) {
      if (this.noteElements.has(note.id)) {
        continue;
      }

      this.renderNote(this.normalizeNote(this.clampNoteToDocument(note)));
      restoredCount += 1;
    }

    return restoredCount;
  };

  NotesBoard.prototype.observeViewport = function observeViewport() {
    window.addEventListener(
      "resize",
      function onResize() {
        this.syncLayerBounds();
        this.noteElements.forEach(
          function eachNote(element, noteId) {
            const note = this.readNoteFromElement(element, noteId);
            const clamped = this.clampNoteToDocument(note);
            this.applyNoteLayout(element, clamped);
            this.scheduleSave(clamped);
          }.bind(this)
        );
      }.bind(this)
    );
  };

  NotesBoard.prototype.ensureContainer = function ensureContainer() {
    if (this.container && this.container.isConnected) {
      this.syncLayerBounds();
      return this.container;
    }

    const container = document.createElement("div");
    container.className = "ph-note-layer";
    document.documentElement.appendChild(container);
    this.container = container;
    this.syncLayerBounds();
    return container;
  };

  NotesBoard.prototype.syncLayerBounds = function syncLayerBounds() {
    if (!this.container) {
      return;
    }

    // La capa ocupa todo el documento para poder mover notas fuera del viewport actual.
    const width = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    this.container.style.width = width + "px";
    this.container.style.height = height + "px";
  };

  NotesBoard.prototype.createNoteFromText = async function createNoteFromText(color, text) {
    this.ensureContainer();
    const note = this.buildNewNote(color);
    note.text = text || "";
    note.title = namespace.truncate ? namespace.truncate(text, 40) : (text || "").slice(0, 40);
    this.renderNote(note);
    await this.storage.saveNote(note);
    return note;
  };

  NotesBoard.prototype.buildNewNote = function buildNewNote(color) {
    const existingCount = this.noteElements.size;
    const width = 290;
    const height = 240;
    const x = window.scrollX + Math.max(24, Math.min(window.innerWidth - width - 24, 40 + existingCount * 24));
    const y = window.scrollY + Math.max(24, Math.min(window.innerHeight - height - 24, 88 + existingCount * 24));
    const timestamp = new Date().toISOString();

    return {
      id: namespace.createNoteId(),
      url: namespace.normalizeUrl(window.location.href),
      title: "Nueva nota",
      text: "",
      color: color,
      x: x,
      y: y,
      width: width,
      height: height,
      isMinimized: false,
      isFavorite: false,
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
  };

  NotesBoard.prototype.renderNote = function renderNote(note) {
    const container = this.ensureContainer();
    const noteElement = document.createElement("article");
    noteElement.className = "ph-note ph-note--" + note.color;
    noteElement.dataset.noteId = note.id;
    noteElement.dataset.createdAt = note.createdAt;
    // Almacena el color personalizado si lo hay
    if (note.customColor) {
      noteElement.dataset.customColor = note.customColor;
      noteElement.style.setProperty("--ph-note-custom-bg", note.customColor);
    }

    noteElement.innerHTML =
      // Título flotante ENCIMA de la nota (fuera del flujo del cuerpo)
      '<div class="ph-note__title-wrap">' +
      '<input class="ph-note__title" type="text" value="" aria-label="Título de la nota" placeholder="Sin título" maxlength="60" />' +
      '</div>' +
      // Barra de arrastre compacta con solo botones
      '<header class="ph-note__header">' +
      '<span class="ph-note__drag-dots" aria-hidden="true">⠿</span>' +
      '<div class="ph-note__actions">' +
      '<button class="ph-note__icon-button" data-action="minimize" type="button" aria-label="Minimizar">—</button>' +
      '<button class="ph-note__icon-button" data-action="delete" type="button" aria-label="Eliminar">✕</button>' +
      '</div>' +
      '</header>' +
      // Paleta de colores + rueda personalizada
      '<div class="ph-note__palette"></div>' +
      // Cuerpo con textarea
      '<label class="ph-note__body">' +
      '<textarea class="ph-note__textarea" placeholder="Escribe tu nota…"></textarea>' +
      '</label>';

    // ── Título (encima de la nota) ──────────────────────────────────────────
    const titleInput = noteElement.querySelector(".ph-note__title");
    if (titleInput) {
      titleInput.value = note.title === "Nueva nota" ? "" : (note.title || "");
      titleInput.addEventListener(
        "input",
        function onTitleInput() {
          const nextNote = Object.assign({}, this.readNoteFromElement(noteElement, note.id), {
            title: titleInput.value || "Nueva nota",
            updatedAt: new Date().toISOString()
          });
          this.scheduleSave(nextNote);
        }.bind(this)
      );
    }

    // ── Paleta de colores + rueda personalizada ─────────────────────────────
    const palette = noteElement.querySelector(".ph-note__palette");

    // Colores predefinidos
    namespace.NOTE_COLOR_OPTIONS.forEach(
      function eachColor(option) {
        const colorButton = document.createElement("button");
        colorButton.type = "button";
        colorButton.className = "ph-note__swatch ph-note__swatch--" + option.id;
        colorButton.dataset.color = option.id;
        colorButton.setAttribute("aria-label", "Color " + option.label);
        colorButton.addEventListener(
          "click",
          function onColorClick() {
            // Quitar color personalizado si había
            noteElement.dataset.customColor = "";
            noteElement.style.removeProperty("--ph-note-custom-bg");
            const nextNote = Object.assign({}, this.readNoteFromElement(noteElement, note.id), {
              color: option.id,
              customColor: undefined,
              updatedAt: new Date().toISOString()
            });
            this.applyNoteLayout(noteElement, nextNote);
            this.scheduleSave(nextNote);
          }.bind(this)
        );
        if (palette) palette.appendChild(colorButton);
      }.bind(this)
    );

    // Separador visual
    const sep = document.createElement("span");
    sep.className = "ph-note__palette-sep";
    sep.setAttribute("aria-hidden", "true");
    if (palette) palette.appendChild(sep);

    // Rueda de color personalizado
    const colorWheel = document.createElement("input");
    colorWheel.type = "color";
    colorWheel.className = "ph-note__color-wheel";
    colorWheel.title = "Color personalizado";
    colorWheel.value = note.customColor || "#facc15";
    colorWheel.addEventListener(
      "input",
      function onWheelChange() {
        const hex = colorWheel.value;
        noteElement.dataset.customColor = hex;
        noteElement.style.setProperty("--ph-note-custom-bg", hex);
        // Aplicar clase custom y quitar las predefinidas
        namespace.NOTE_COLOR_OPTIONS.forEach(function(o) {
          noteElement.classList.remove("ph-note--" + o.id);
        });
        noteElement.classList.remove("ph-note--custom");
        noteElement.classList.add("ph-note--custom");
        const nextNote = Object.assign({}, this.readNoteFromElement(noteElement, note.id), {
          color: "custom",
          customColor: hex,
          updatedAt: new Date().toISOString()
        });
        this.scheduleSave(nextNote);
      }.bind(this)
    );
    if (palette) palette.appendChild(colorWheel);

    const textarea = noteElement.querySelector(".ph-note__textarea");
    if (textarea) {
      textarea.value = note.text;
      textarea.addEventListener(
        "input",
        function onInput() {
          const nextNote = Object.assign({}, this.readNoteFromElement(noteElement, note.id), {
            text: textarea.value,
            updatedAt: new Date().toISOString()
          });
          this.scheduleSave(nextNote);
        }.bind(this)
      );
    }

    noteElement.querySelector('[data-action="delete"]').addEventListener(
      "click",
      async function onDelete() {
        noteElement.classList.add("is-removing");
        window.clearTimeout(this.saveTimers.get(note.id));
        this.saveTimers.delete(note.id);
        window.setTimeout(function removeNode() {
          noteElement.remove();
        }, 180);
        this.noteElements.delete(note.id);
        this.disconnectResizeObserver(note.id);
        await this.storage.removeNote(window.location.href, note.id);
      }.bind(this)
    );

    noteElement.querySelector('[data-action="minimize"]').addEventListener(
      "click",
      function onMinimize() {
        const nextNote = Object.assign({}, this.readNoteFromElement(noteElement, note.id), {
          isMinimized: !noteElement.classList.contains("is-minimized"),
          updatedAt: new Date().toISOString()
        });
        this.applyNoteLayout(noteElement, nextNote);
        this.scheduleSave(nextNote);
      }.bind(this)
    );

    const dragHandle = noteElement.querySelector(".ph-note__header");
    dragHandle.addEventListener(
      "pointerdown",
      function onPointerDown(event) {
        if (event.target.closest("button, input, textarea")) {
          return;
        }

        const startNote = this.readNoteFromElement(noteElement, note.id);
        const offsetX = event.pageX - startNote.x;
        const offsetY = event.pageY - startNote.y;
        dragHandle.setPointerCapture(event.pointerId);

        const handleMove = function handleMove(moveEvent) {
          const movedNote = this.clampNoteToDocument(
            Object.assign({}, this.readNoteFromElement(noteElement, note.id), {
              x: moveEvent.pageX - offsetX,
              y: moveEvent.pageY - offsetY,
              updatedAt: new Date().toISOString()
            })
          );
          this.applyNoteLayout(noteElement, movedNote);
        }.bind(this);

        const handleUp = function handleUp() {
          dragHandle.removeEventListener("pointermove", handleMove);
          dragHandle.removeEventListener("pointerup", handleUp);
          dragHandle.removeEventListener("pointercancel", handleUp);
          const movedNote = Object.assign({}, this.readNoteFromElement(noteElement, note.id), {
            updatedAt: new Date().toISOString()
          });
          this.scheduleSave(movedNote);
        }.bind(this);

        dragHandle.addEventListener("pointermove", handleMove);
        dragHandle.addEventListener("pointerup", handleUp);
        dragHandle.addEventListener("pointercancel", handleUp);
      }.bind(this)
    );

    container.appendChild(noteElement);
    this.noteElements.set(note.id, noteElement);
    // applyNoteLayout gestiona el color (incluido personalizado) y la posición
    this.applyNoteLayout(noteElement, note);
    // Sincronizar el valor de la rueda si hay color personalizado
    if (note.color === "custom" && note.customColor) {
      const wheel = noteElement.querySelector(".ph-note__color-wheel");
      if (wheel) wheel.value = note.customColor;
    }
    this.observeNoteResize(noteElement, note.id);
  };

  NotesBoard.prototype.observeNoteResize = function observeNoteResize(noteElement, noteId) {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(
      function onResize() {
        const note = Object.assign({}, this.readNoteFromElement(noteElement, noteId), {
          updatedAt: new Date().toISOString()
        });
        this.scheduleSave(this.clampNoteToDocument(note));
      }.bind(this)
    );

    observer.observe(noteElement);
    this.resizeObservers.set(noteId, observer);
  };

  NotesBoard.prototype.disconnectResizeObserver = function disconnectResizeObserver(noteId) {
    if (this.resizeObservers.has(noteId)) {
      this.resizeObservers.get(noteId).disconnect();
      this.resizeObservers.delete(noteId);
    }
  };

  NotesBoard.prototype.applyNoteLayout = function applyNoteLayout(noteElement, note) {
    const clampedNote = this.clampNoteToDocument(note);
    this.syncLayerBounds();
    noteElement.style.left = clampedNote.x + "px";
    noteElement.style.top = clampedNote.y + "px";
    noteElement.style.width = clampedNote.width + "px";
    noteElement.style.height = (clampedNote.isMinimized ? 44 : clampedNote.height) + "px";
    noteElement.dataset.x = String(clampedNote.x);
    noteElement.dataset.y = String(clampedNote.y);
    noteElement.dataset.width = String(clampedNote.width);
    noteElement.dataset.height = String(clampedNote.height);
    noteElement.dataset.color = clampedNote.color;
    noteElement.dataset.minimized = String(clampedNote.isMinimized);
    noteElement.dataset.favorite  = String(Boolean(clampedNote.isFavorite));
    noteElement.classList.toggle("is-minimized", clampedNote.isMinimized);

    // Gestión de color: predefinido o personalizado
    namespace.NOTE_COLOR_OPTIONS.forEach(function(option) {
      noteElement.classList.remove("ph-note--" + option.id);
    });
    noteElement.classList.remove("ph-note--custom");

    if (clampedNote.color === "custom" && clampedNote.customColor) {
      noteElement.classList.add("ph-note--custom");
      noteElement.style.setProperty("--ph-note-custom-bg", clampedNote.customColor);
      noteElement.dataset.customColor = clampedNote.customColor;
      // Actualizar la rueda si existe
      const wheel = noteElement.querySelector(".ph-note__color-wheel");
      if (wheel) wheel.value = clampedNote.customColor;
    } else {
      noteElement.style.removeProperty("--ph-note-custom-bg");
      noteElement.dataset.customColor = "";
      noteElement.classList.add("ph-note--" + clampedNote.color);
    }
  };

  NotesBoard.prototype.readNoteFromElement = function readNoteFromElement(noteElement, noteId) {
    const titleInput = noteElement.querySelector(".ph-note__title");
    const textarea = noteElement.querySelector(".ph-note__textarea");
    const rawColor = noteElement.dataset.color || "yellow";
    const customColor = noteElement.dataset.customColor || undefined;
    return this.normalizeNote({
      id: noteId,
      url: namespace.normalizeUrl(window.location.href),
      title: titleInput ? (titleInput.value || "Nueva nota") : "Nueva nota",
      text: textarea ? textarea.value : "",
      color: rawColor,
      customColor: customColor || undefined,
      x: Number(noteElement.dataset.x || window.scrollX + 32),
      y: Number(noteElement.dataset.y || window.scrollY + 72),
      width: Number(noteElement.dataset.width || noteElement.offsetWidth || 280),
      height: Number(noteElement.dataset.height || noteElement.offsetHeight || 230),
      isMinimized: noteElement.dataset.minimized === "true",
      isFavorite:  noteElement.dataset.favorite === "true",
      tags:        [],
      createdAt: noteElement.dataset.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  NotesBoard.prototype.scheduleSave = function scheduleSave(note) {
    window.clearTimeout(this.saveTimers.get(note.id));
    const timerId = window.setTimeout(
      function persistLater() {
        // Agrupamos cambios rapidos para no escribir en storage en cada tecla o pixel.
        void this.storage.saveNote(this.clampNoteToDocument(note));
      }.bind(this),
      180
    );
    this.saveTimers.set(note.id, timerId);
  };

  NotesBoard.prototype.clampNoteToDocument = function clampNoteToDocument(note) {
    const minVisible = 60;
    const maxDocumentWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const maxDocumentHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const width = Math.max(220, Math.min(note.width, Math.max(220, maxDocumentWidth - 24)));
    const height = Math.max(150, Math.min(note.height, Math.max(150, maxDocumentHeight - 24)));
    const maxX = Math.max(8, maxDocumentWidth - minVisible);
    const maxY = Math.max(8, maxDocumentHeight - minVisible);

    return Object.assign({}, note, {
      x: Math.max(8 - width + minVisible, Math.min(note.x, maxX)),
      y: Math.max(8, Math.min(note.y, maxY)),
      width: width,
      height: height
    });
  };

  NotesBoard.prototype.normalizeNote = function normalizeNote(note) {
    return Object.assign({}, note, {
      title: note.title && String(note.title).trim() ? String(note.title).trim() : "Nueva nota",
      text: note.text || "",
      color: note.color || "yellow",
      customColor: note.customColor || undefined,
      width: Number.isFinite(note.width) ? note.width : 280,
      height: Number.isFinite(note.height) ? note.height : 230,
      x: Number.isFinite(note.x) ? note.x : window.scrollX + 40,
      y: Number.isFinite(note.y) ? note.y : window.scrollY + 88
    });
  };

  namespace.NotesBoard = NotesBoard;
})(globalThis);
