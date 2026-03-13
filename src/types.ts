namespace PersistentHighlighter {
  export type HighlightPresetColor =
    | "yellow"
    | "green"
    | "blue"
    | "pink"
    | "orange"
    | "purple"
    | "teal"
    | "gray";

  export type HighlightColor = HighlightPresetColor | "custom";

  export interface HighlightRecord {
    id: string;
    url: string;
    selectedText: string;
    color: HighlightColor;
    customColor?: string;
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
    customColor: string;
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
    | { type: "APPLY_HIGHLIGHT"; color: HighlightColor; customColor?: string }
    | { type: "REMOVE_HIGHLIGHT"; highlightId: string }
    | { type: "CLEAR_HIGHLIGHTS" }
    | { type: "RESTORE_HIGHLIGHTS" };

  export const STORAGE_KEY = "persistent-highlighter.recordsByUrl";
  export const SETTINGS_KEY = "persistent-highlighter.settings";
  export const HIGHLIGHT_CLASS = "ph-highlight";
  export const HIGHLIGHT_ATTR = "data-ph-id";
  export const DYNAMIC_RESTORE_DELAY_MS = 700;
  export const DEFAULT_COLOR: HighlightColor = "yellow";
  export const COLOR_OPTIONS: Array<{ id: HighlightPresetColor; label: string; circle: string }> = [
    { id: "yellow", label: "Amarillo", circle: "🟡" },
    { id: "green", label: "Verde", circle: "🟢" },
    { id: "blue", label: "Azul", circle: "🔵" },
    { id: "pink", label: "Rosa", circle: "🩷" },
    { id: "orange", label: "Naranja", circle: "🟠" },
    { id: "purple", label: "Morado", circle: "🟣" },
    { id: "teal", label: "Turquesa", circle: "🔹" },
    { id: "gray", label: "Gris", circle: "⚪" }
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

  export function sanitizeColorHex(rawColor?: string): string {
    const value = (rawColor || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : "#facc15";
  }
}
