namespace PersistentHighlighter {
  export type HighlightColor =
    | "yellow"
    | "green"
    | "blue"
    | "pink"
    | "orange"
    | "purple"
    | "teal"
    | "gray";

  export interface HighlightRecord {
    id: string;
    url: string;
    selectedText: string;
    color: HighlightColor;
    createdAt: string;
    surroundingText: string;
    prefix: string;
    suffix: string;
    startXPath?: string;
    endXPath?: string;
    startOffset?: number;
    endOffset?: number;
    domHint?: string;
    signature: string;
  }

  export interface PopupSettings {
    selectedColor: HighlightColor;
  }

  export interface ExtensionResponse<T = undefined> {
    ok: boolean;
    error?: string;
    data?: T;
  }

  export interface HighlightOperationResult {
    record?: HighlightRecord;
    removedId?: string;
    removedCount?: number;
  }

  export type ExtensionMessage =
    | { type: "APPLY_HIGHLIGHT"; color: HighlightColor }
    | { type: "REMOVE_HIGHLIGHT"; highlightId: string }
    | { type: "CLEAR_HIGHLIGHTS" }
    | { type: "RESTORE_HIGHLIGHTS" };

  export const STORAGE_KEY = "persistent-highlighter.recordsByUrl";
  export const SETTINGS_KEY = "persistent-highlighter.settings";
  export const HIGHLIGHT_CLASS = "ph-highlight";
  export const HIGHLIGHT_ATTR = "data-ph-id";
  export const DYNAMIC_RESTORE_DELAY_MS = 700;
  export const DEFAULT_COLOR: HighlightColor = "yellow";
  export const COLOR_OPTIONS: Array<{ id: HighlightColor; label: string }> = [
    { id: "yellow", label: "Amarillo" },
    { id: "green", label: "Verde" },
    { id: "blue", label: "Azul" },
    { id: "pink", label: "Rosa" },
    { id: "orange", label: "Naranja" },
    { id: "purple", label: "Morado" },
    { id: "teal", label: "Turquesa" },
    { id: "gray", label: "Gris" }
  ];

  export function normalizeUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return url.toString();
    } catch (_error) {
      return rawUrl.split("#")[0];
    }
  }

  export function normalizeText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  export function createId(): string {
    return `hl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  export function buildSignature(
    selectedText: string,
    prefix: string,
    suffix: string,
    domHint?: string
  ): string {
    return [
      normalizeText(selectedText).toLowerCase(),
      normalizeText(prefix).toLowerCase(),
      normalizeText(suffix).toLowerCase(),
      (domHint || "").toLowerCase()
    ].join("::");
  }
}
