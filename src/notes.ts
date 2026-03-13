/// <reference path="./types.ts" />
/// <reference path="./storage.ts" />

namespace PersistentHighlighter {
  export class NotesBoard {
    private container: HTMLElement | null = null;
    private noteElements = new Map<string, HTMLElement>();
    private saveTimers = new Map<string, number>();
    private resizeObservers = new Map<string, ResizeObserver>();

    constructor(private readonly storage: HighlightStorage) {}

    async createNote(color: NoteColor): Promise<PostItNote> {
      this.ensureContainer();
      const note = this.buildNewNote(color);
      this.renderNote(note);
      await this.storage.saveNote(note);
      return note;
    }

    async restoreNotesForCurrentPage(): Promise<number> {
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
    }

    observeViewport(): void {
      window.addEventListener("resize", () => {
        this.syncLayerBounds();
        this.noteElements.forEach((element, noteId) => {
          const note = this.readNoteFromElement(element, noteId);
          const clamped = this.clampNoteToDocument(note);
          this.applyNoteLayout(element, clamped);
          this.scheduleSave(clamped);
        });
      });
    }

    private ensureContainer(): HTMLElement {
      if (this.container?.isConnected) {
        this.syncLayerBounds();
        return this.container;
      }

      const container = document.createElement("div");
      container.className = "ph-note-layer";
      document.documentElement.appendChild(container);
      this.container = container;
      this.syncLayerBounds();
      return container;
    }

    private syncLayerBounds(): void {
      if (!this.container) {
        return;
      }

      // La capa ocupa todo el documento para poder mover notas fuera del viewport actual.
      const width = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      this.container.style.width = `${width}px`;
      this.container.style.height = `${height}px`;
    }

    private buildNewNote(color: NoteColor): PostItNote {
      const existingCount = this.noteElements.size;
      const width = 280;
      const height = 230;
      const x = window.scrollX + Math.max(24, Math.min(window.innerWidth - width - 24, 40 + existingCount * 24));
      const y = window.scrollY + Math.max(24, Math.min(window.innerHeight - height - 24, 88 + existingCount * 24));
      const timestamp = new Date().toISOString();

      return {
        id: createNoteId(),
        url: normalizeUrl(window.location.href),
        title: "Nueva nota",
        text: "",
        color,
        x,
        y,
        width,
        height,
        isMinimized: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }

    private renderNote(note: PostItNote): void {
      const container = this.ensureContainer();
      const noteElement = document.createElement("article");
      noteElement.className = `ph-note ph-note--${note.color}`;
      noteElement.dataset.noteId = note.id;
      noteElement.dataset.createdAt = note.createdAt;
      noteElement.innerHTML = `
        <header class="ph-note__header">
          <div class="ph-note__header-main">
            <span class="ph-note__drag" aria-hidden="true">Mover</span>
            <input class="ph-note__title" type="text" value="" aria-label="Nombre de la nota" placeholder="Titulo de la nota" />
          </div>
          <div class="ph-note__actions">
            <button class="ph-note__icon-button" data-action="minimize" type="button" aria-label="Minimizar">_</button>
            <button class="ph-note__icon-button" data-action="delete" type="button" aria-label="Eliminar">x</button>
          </div>
        </header>
        <div class="ph-note__palette"></div>
        <label class="ph-note__body">
          <textarea class="ph-note__textarea" placeholder="Escribe tu nota..."></textarea>
        </label>
      `;

      const titleInput = noteElement.querySelector<HTMLInputElement>(".ph-note__title");
      if (titleInput) {
        titleInput.value = note.title;
        titleInput.addEventListener("input", () => {
          const nextNote = {
            ...this.readNoteFromElement(noteElement, note.id),
            title: titleInput.value,
            updatedAt: new Date().toISOString()
          };
          this.scheduleSave(nextNote);
        });
      }

      const palette = noteElement.querySelector<HTMLElement>(".ph-note__palette");
      for (const option of NOTE_COLOR_OPTIONS) {
        const colorButton = document.createElement("button");
        colorButton.type = "button";
        colorButton.className = `ph-note__swatch ph-note__swatch--${option.id}`;
        colorButton.dataset.color = option.id;
        colorButton.setAttribute("aria-label", `Color ${option.label}`);
        colorButton.addEventListener("click", () => {
          const nextNote = {
            ...this.readNoteFromElement(noteElement, note.id),
            color: option.id,
            updatedAt: new Date().toISOString()
          };
          this.applyNoteLayout(noteElement, nextNote);
          this.scheduleSave(nextNote);
        });
        palette?.appendChild(colorButton);
      }

      const textarea = noteElement.querySelector<HTMLTextAreaElement>(".ph-note__textarea");
      if (textarea) {
        textarea.value = note.text;
        textarea.addEventListener("input", () => {
          const nextNote = {
            ...this.readNoteFromElement(noteElement, note.id),
            text: textarea.value,
            updatedAt: new Date().toISOString()
          };
          this.scheduleSave(nextNote);
        });
      }

      noteElement.querySelector<HTMLElement>('[data-action="delete"]')?.addEventListener("click", async () => {
        noteElement.classList.add("is-removing");
        window.clearTimeout(this.saveTimers.get(note.id));
        this.saveTimers.delete(note.id);
        window.setTimeout(() => {
          noteElement.remove();
        }, 180);
        this.noteElements.delete(note.id);
        this.disconnectResizeObserver(note.id);
        await this.storage.removeNote(window.location.href, note.id);
      });

      noteElement.querySelector<HTMLElement>('[data-action="minimize"]')?.addEventListener("click", () => {
        const nextNote = {
          ...this.readNoteFromElement(noteElement, note.id),
          isMinimized: !noteElement.classList.contains("is-minimized"),
          updatedAt: new Date().toISOString()
        };
        this.applyNoteLayout(noteElement, nextNote);
        this.scheduleSave(nextNote);
      });

      const dragHandle = noteElement.querySelector<HTMLElement>(".ph-note__header");
      dragHandle?.addEventListener("pointerdown", (event) => {
        if ((event.target as HTMLElement).closest("button, input, textarea")) {
          return;
        }

        // Arrastramos desde la cabecera y usamos coordenadas del documento para mover la nota por toda la pagina.
        const startNote = this.readNoteFromElement(noteElement, note.id);
        const offsetX = event.pageX - startNote.x;
        const offsetY = event.pageY - startNote.y;
        dragHandle.setPointerCapture(event.pointerId);

        const handleMove = (moveEvent: PointerEvent) => {
          const movedNote = this.clampNoteToDocument({
            ...this.readNoteFromElement(noteElement, note.id),
            x: moveEvent.pageX - offsetX,
            y: moveEvent.pageY - offsetY,
            updatedAt: new Date().toISOString()
          });
          this.applyNoteLayout(noteElement, movedNote);
        };

        const handleUp = () => {
          dragHandle.removeEventListener("pointermove", handleMove);
          dragHandle.removeEventListener("pointerup", handleUp);
          dragHandle.removeEventListener("pointercancel", handleUp);
          const movedNote = {
            ...this.readNoteFromElement(noteElement, note.id),
            updatedAt: new Date().toISOString()
          };
          this.scheduleSave(movedNote);
        };

        dragHandle.addEventListener("pointermove", handleMove);
        dragHandle.addEventListener("pointerup", handleUp);
        dragHandle.addEventListener("pointercancel", handleUp);
      });

      container.appendChild(noteElement);
      this.noteElements.set(note.id, noteElement);
      this.applyNoteLayout(noteElement, note);
      this.observeNoteResize(noteElement, note.id);
    }

    private observeNoteResize(noteElement: HTMLElement, noteId: string): void {
      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const observer = new ResizeObserver(() => {
        const note = {
          ...this.readNoteFromElement(noteElement, noteId),
          updatedAt: new Date().toISOString()
        };
        this.scheduleSave(this.clampNoteToDocument(note));
      });

      observer.observe(noteElement);
      this.resizeObservers.set(noteId, observer);
    }

    private disconnectResizeObserver(noteId: string): void {
      this.resizeObservers.get(noteId)?.disconnect();
      this.resizeObservers.delete(noteId);
    }

    private applyNoteLayout(noteElement: HTMLElement, note: PostItNote): void {
      const clampedNote = this.clampNoteToDocument(note);
      this.syncLayerBounds();
      noteElement.style.left = `${clampedNote.x}px`;
      noteElement.style.top = `${clampedNote.y}px`;
      noteElement.style.width = `${clampedNote.width}px`;
      noteElement.style.height = `${clampedNote.isMinimized ? 60 : clampedNote.height}px`;
      noteElement.dataset.x = String(clampedNote.x);
      noteElement.dataset.y = String(clampedNote.y);
      noteElement.dataset.width = String(clampedNote.width);
      noteElement.dataset.height = String(clampedNote.height);
      noteElement.dataset.color = clampedNote.color;
      noteElement.dataset.minimized = String(clampedNote.isMinimized);
      noteElement.classList.toggle("is-minimized", clampedNote.isMinimized);

      for (const option of NOTE_COLOR_OPTIONS) {
        noteElement.classList.remove(`ph-note--${option.id}`);
      }
      noteElement.classList.add(`ph-note--${clampedNote.color}`);
    }

    private readNoteFromElement(noteElement: HTMLElement, noteId: string): PostItNote {
      const titleInput = noteElement.querySelector<HTMLInputElement>(".ph-note__title");
      const textarea = noteElement.querySelector<HTMLTextAreaElement>(".ph-note__textarea");
      return this.normalizeNote({
        id: noteId,
        url: normalizeUrl(window.location.href),
        title: titleInput?.value || "Nueva nota",
        text: textarea?.value || "",
        color: (noteElement.dataset.color as NoteColor) || "yellow",
        x: Number(noteElement.dataset.x || window.scrollX + 32),
        y: Number(noteElement.dataset.y || window.scrollY + 72),
        width: Number(noteElement.dataset.width || noteElement.offsetWidth || 280),
        height: Number(noteElement.dataset.height || noteElement.offsetHeight || 230),
        isMinimized: noteElement.dataset.minimized === "true",
        createdAt: noteElement.dataset.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    private scheduleSave(note: PostItNote): void {
      window.clearTimeout(this.saveTimers.get(note.id));
      const timerId = window.setTimeout(() => {
        // Agrupamos cambios rapidos para no escribir en storage en cada tecla o pixel.
        void this.storage.saveNote(this.clampNoteToDocument(note));
      }, 180);
      this.saveTimers.set(note.id, timerId);
    }

    private clampNoteToDocument(note: PostItNote): PostItNote {
      const minVisible = 60;
      const maxDocumentWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const maxDocumentHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      const width = Math.max(220, Math.min(note.width, Math.max(220, maxDocumentWidth - 24)));
      const height = Math.max(150, Math.min(note.height, Math.max(150, maxDocumentHeight - 24)));
      const maxX = Math.max(8, maxDocumentWidth - minVisible);
      const maxY = Math.max(8, maxDocumentHeight - minVisible);

      return {
        ...note,
        x: Math.max(8 - width + minVisible, Math.min(note.x, maxX)),
        y: Math.max(8, Math.min(note.y, maxY)),
        width,
        height
      };
    }

    private normalizeNote(note: PostItNote): PostItNote {
      return {
        ...note,
        title: note.title?.trim() || "Nueva nota",
        text: note.text || "",
        width: Number.isFinite(note.width) ? note.width : 280,
        height: Number.isFinite(note.height) ? note.height : 230,
        x: Number.isFinite(note.x) ? note.x : window.scrollX + 40,
        y: Number.isFinite(note.y) ? note.y : window.scrollY + 88
      };
    }
  }
}
