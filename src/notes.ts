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

        this.renderNote(this.clampNoteToViewport(note));
        restoredCount += 1;
      }

      return restoredCount;
    }

    observeViewport(): void {
      window.addEventListener("resize", () => {
        this.noteElements.forEach((element, noteId) => {
          const note = this.readNoteFromElement(element, noteId);
          const clamped = this.clampNoteToViewport(note);
          this.applyNoteLayout(element, clamped);
          this.scheduleSave(clamped);
        });
      });
    }

    private ensureContainer(): HTMLElement {
      if (this.container?.isConnected) {
        return this.container;
      }

      const container = document.createElement("div");
      container.className = "ph-note-layer";
      document.documentElement.appendChild(container);
      this.container = container;
      return container;
    }

    private buildNewNote(color: NoteColor): PostItNote {
      const existingCount = this.noteElements.size;
      const width = 260;
      const height = 220;
      const x = Math.max(24, Math.min(window.innerWidth - width - 24, 40 + existingCount * 24));
      const y = Math.max(24, Math.min(window.innerHeight - height - 24, 80 + existingCount * 24));
      const timestamp = new Date().toISOString();

      return {
        id: createNoteId(),
        url: normalizeUrl(window.location.href),
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
      noteElement.innerHTML = `
        <header class="ph-note__header">
          <span class="ph-note__drag">Post-it</span>
          <div class="ph-note__actions">
            <button class="ph-note__icon-button" data-action="minimize" type="button" aria-label="Minimizar">_</button>
            <button class="ph-note__icon-button" data-action="delete" type="button" aria-label="Eliminar">×</button>
          </div>
        </header>
        <div class="ph-note__palette"></div>
        <label class="ph-note__body">
          <textarea class="ph-note__textarea" placeholder="Escribe tu nota..."></textarea>
        </label>
      `;

      const palette = noteElement.querySelector<HTMLElement>(".ph-note__palette");
      for (const option of NOTE_COLOR_OPTIONS) {
        const colorButton = document.createElement("button");
        colorButton.type = "button";
        colorButton.className = `ph-note__swatch ph-note__swatch--${option.id}`;
        colorButton.dataset.color = option.id;
        colorButton.setAttribute("aria-label", `Color ${option.label}`);
        colorButton.addEventListener("click", () => {
          const nextNote = { ...this.readNoteFromElement(noteElement, note.id), color: option.id, updatedAt: new Date().toISOString() };
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

      const dragHandle = noteElement.querySelector<HTMLElement>(".ph-note__drag");
      dragHandle?.addEventListener("pointerdown", (event) => {
        if ((event.target as HTMLElement).closest("button")) {
          return;
        }

        // Arrastramos solo desde la cabecera para no interferir con la edición del texto.
        const startNote = this.readNoteFromElement(noteElement, note.id);
        const offsetX = event.clientX - startNote.x;
        const offsetY = event.clientY - startNote.y;
        dragHandle.setPointerCapture(event.pointerId);

        const handleMove = (moveEvent: PointerEvent) => {
          const movedNote = this.clampNoteToViewport({
            ...this.readNoteFromElement(noteElement, note.id),
            x: moveEvent.clientX - offsetX,
            y: moveEvent.clientY - offsetY,
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
        this.scheduleSave(this.clampNoteToViewport(note));
      });

      observer.observe(noteElement);
      this.resizeObservers.set(noteId, observer);
    }

    private disconnectResizeObserver(noteId: string): void {
      this.resizeObservers.get(noteId)?.disconnect();
      this.resizeObservers.delete(noteId);
    }

    private applyNoteLayout(noteElement: HTMLElement, note: PostItNote): void {
      const clampedNote = this.clampNoteToViewport(note);
      noteElement.style.left = `${clampedNote.x}px`;
      noteElement.style.top = `${clampedNote.y}px`;
      noteElement.style.width = `${clampedNote.width}px`;
      noteElement.style.height = `${clampedNote.isMinimized ? 56 : clampedNote.height}px`;
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
      const textarea = noteElement.querySelector<HTMLTextAreaElement>(".ph-note__textarea");
      return {
        id: noteId,
        url: normalizeUrl(window.location.href),
        text: textarea?.value || "",
        color: (noteElement.dataset.color as NoteColor) || "yellow",
        x: Number(noteElement.dataset.x || 32),
        y: Number(noteElement.dataset.y || 64),
        width: Number(noteElement.dataset.width || noteElement.offsetWidth || 260),
        height: Number(noteElement.dataset.height || noteElement.offsetHeight || 220),
        isMinimized: noteElement.dataset.minimized === "true",
        createdAt: noteElement.dataset.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    private scheduleSave(note: PostItNote): void {
      window.clearTimeout(this.saveTimers.get(note.id));
      const timerId = window.setTimeout(() => {
        void this.storage.saveNote(this.clampNoteToViewport(note));
      }, 180);
      this.saveTimers.set(note.id, timerId);
    }

    private clampNoteToViewport(note: PostItNote): PostItNote {
      const minVisible = 56;
      const width = Math.max(220, Math.min(note.width, Math.max(220, window.innerWidth - 24)));
      const height = Math.max(140, Math.min(note.height, Math.max(140, window.innerHeight - 24)));
      const maxX = Math.max(8, window.innerWidth - minVisible);
      const maxY = Math.max(8, window.innerHeight - minVisible);

      return {
        ...note,
        x: Math.max(8 - width + minVisible, Math.min(note.x, maxX)),
        y: Math.max(8, Math.min(note.y, maxY)),
        width,
        height
      };
    }
  }
}
