/// <reference path="./types.ts" />
/// <reference path="./storage.ts" />

namespace PersistentHighlighter {
  interface TextEntry {
    node: Text;
    start: number;
    end: number;
  }

  interface TextMap {
    text: string;
    entries: TextEntry[];
  }

  export class HighlightRenderer {
    private mutationObserver: MutationObserver | null = null;
    private restoreTimerId = 0;
    private restoreInFlight = false;
    private lastSelectionRange: Range | null = null;

    constructor(private readonly storage: HighlightStorage) {}

    async applySelectionHighlight(color: HighlightColor, customColor?: string): Promise<HighlightRecord> {
      const selection = window.getSelection();
      const liveRange =
        selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : null;
      const range = liveRange || this.lastSelectionRange?.cloneRange() || null;
      const selectedText = normalizeText(range?.toString() || "");
      if (!selectedText) {
        throw new Error("Selecciona un texto antes de resaltar.");
      }

      const resolvedCustomColor = color === "custom" ? sanitizeColorHex(customColor) : undefined;

      if (!range || !this.isRangeHighlightable(range)) {
        const selectedHighlight = this.findHighlightElementForNode(range?.commonAncestorContainer || null);
        if (!selectedHighlight) {
          throw new Error("No se puede resaltar esa seleccion de forma segura.");
        }

        const existingId = selectedHighlight.getAttribute(HIGHLIGHT_ATTR);
        if (!existingId) {
          throw new Error("No se pudo actualizar el resaltado seleccionado.");
        }

        const existingRecords = await this.storage.getHighlights(window.location.href);
        const existingRecord = existingRecords.find((record) => record.id === existingId);
        if (!existingRecord) {
          throw new Error("No se encontró el resaltado existente.");
        }

        if (existingRecord.color === color && existingRecord.customColor === resolvedCustomColor) {
          throw new Error("Ese texto ya tiene ese color.");
        }

        const updatedRecord = { ...existingRecord, color, customColor: resolvedCustomColor };
        this.updateHighlightElementColor(selectedHighlight, color, resolvedCustomColor);
        await this.storage.saveHighlight(updatedRecord);
        return updatedRecord;
      }

      const record = this.createRecordFromRange(
        range,
        selectedText,
        color,
        normalizeUrl(window.location.href),
        resolvedCustomColor
      );
      const existing = await this.storage.getHighlights(record.url);
      const matchingRecord = this.storage.findMatchingHighlight(existing, record);
      if (matchingRecord) {
        if (matchingRecord.color === color && matchingRecord.customColor === resolvedCustomColor) {
          throw new Error("Ese texto ya tiene ese color.");
        }

        const updatedRecord = { ...matchingRecord, color, customColor: resolvedCustomColor };
        const existingElement = this.findHighlightElement(matchingRecord.id);
        if (existingElement) {
          this.updateHighlightElementColor(existingElement, color, resolvedCustomColor);
        } else {
          this.wrapRange(range, updatedRecord);
        }

        selection?.removeAllRanges();
        await this.storage.saveHighlight(updatedRecord);
        return updatedRecord;
      }

      this.wrapRange(range, record);
      selection?.removeAllRanges();
      await this.storage.saveHighlight(record);
      return record;
    }

    rememberCurrentSelection(): void {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }

      const range = selection.getRangeAt(0).cloneRange();
      if (!normalizeText(range.toString()) || !this.isRangeHighlightable(range)) {
        return;
      }

      this.lastSelectionRange = range;
    }

    async restoreHighlightsForCurrentPage(): Promise<number> {
      const records = await this.storage.getHighlights(window.location.href);
      let restoredCount = 0;

      for (const record of records) {
        if (this.findHighlightElement(record.id)) {
          continue;
        }

        const range = this.findRangeForRecord(record);
        if (!range || range.collapsed) {
          continue;
        }

        try {
          this.wrapRange(range, record);
          restoredCount += 1;
        } catch (_error) {
          // Ignore records that no longer map cleanly after major DOM changes.
        }
      }

      return restoredCount;
    }

    async removeHighlightById(highlightId: string): Promise<boolean> {
      const target = this.findHighlightElement(highlightId);
      if (target) {
        this.unwrapHighlight(target);
      }

      await this.storage.removeHighlight(window.location.href, highlightId);
      return Boolean(target);
    }

    async clearCurrentPage(): Promise<number> {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`));
      for (const element of elements) {
        this.unwrapHighlight(element);
      }

      await this.storage.clearHighlights(window.location.href);
      return elements.length;
    }

    observeDynamicContent(): void {
      if (this.mutationObserver || !document.body) {
        return;
      }

      this.mutationObserver = new MutationObserver((mutations) => {
        const shouldRestore = mutations.some((mutation) => {
          if (mutation.type === "characterData") {
            return !this.isInsideHighlight(mutation.target);
          }

          return Array.from(mutation.addedNodes).some((node) => !this.isInsideHighlight(node));
        });

        if (!shouldRestore || this.restoreInFlight) {
          return;
        }

        window.clearTimeout(this.restoreTimerId);
        this.restoreTimerId = window.setTimeout(async () => {
          this.restoreInFlight = true;
          try {
            await this.restoreHighlightsForCurrentPage();
          } finally {
            this.restoreInFlight = false;
          }
        }, DYNAMIC_RESTORE_DELAY_MS);
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    private createRecordFromRange(
      range: Range,
      selectedText: string,
      color: HighlightColor,
      url: string,
      customColor?: string
    ): HighlightRecord {
      const prefix = this.getContextSnippet(range, "prefix");
      const suffix = this.getContextSnippet(range, "suffix");
      const domHint = this.getDomHint(range.commonAncestorContainer);

      return {
        id: createId(),
        url,
        selectedText,
        color,
        customColor,
        createdAt: new Date().toISOString(),
        surroundingText: `${prefix}${selectedText}${suffix}`.trim(),
        prefix,
        suffix,
        startXPath: this.getXPathForNode(range.startContainer),
        endXPath: this.getXPathForNode(range.endContainer),
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        domHint,
        signature: buildSignature(selectedText, prefix, suffix, domHint)
      };
    }

    private findRangeForRecord(record: HighlightRecord): Range | null {
      const descriptorRange = this.tryRangeFromDescriptor(record);
      if (descriptorRange) {
        return descriptorRange;
      }

      for (const root of this.getSearchRoots(record)) {
        const textMap = this.buildTextMap(root);
        if (!textMap.text) {
          continue;
        }

        let searchIndex = 0;
        while (searchIndex < textMap.text.length) {
          const matchIndex = textMap.text.indexOf(record.selectedText, searchIndex);
          if (matchIndex === -1) {
            break;
          }

          const endIndex = matchIndex + record.selectedText.length;
          const prefix = textMap.text.slice(Math.max(0, matchIndex - record.prefix.length), matchIndex);
          const suffix = textMap.text.slice(endIndex, endIndex + record.suffix.length);

          if (record.prefix && !prefix.endsWith(record.prefix)) {
            searchIndex = matchIndex + 1;
            continue;
          }

          if (record.suffix && !suffix.startsWith(record.suffix)) {
            searchIndex = matchIndex + 1;
            continue;
          }

          const range = this.createRangeFromOffsets(textMap.entries, matchIndex, endIndex);
          if (range && normalizeText(range.toString()) === normalizeText(record.selectedText)) {
            return range;
          }

          searchIndex = matchIndex + 1;
        }
      }

      return null;
    }

    private tryRangeFromDescriptor(record: HighlightRecord): Range | null {
      if (!record.startXPath || !record.endXPath) {
        return null;
      }

      try {
        const startNode = this.getNodeByXPath(record.startXPath);
        const endNode = this.getNodeByXPath(record.endXPath);
        if (!startNode || !endNode) {
          return null;
        }

        const range = document.createRange();
        range.setStart(startNode, Math.min(record.startOffset || 0, this.getNodeLength(startNode)));
        range.setEnd(endNode, Math.min(record.endOffset || 0, this.getNodeLength(endNode)));
        return normalizeText(range.toString()) === normalizeText(record.selectedText) ? range : null;
      } catch (_error) {
        return null;
      }
    }

    private getSearchRoots(record: HighlightRecord): Node[] {
      const roots: Node[] = [];

      if (record.domHint) {
        try {
          const hintedRoot = document.querySelector(record.domHint);
          if (hintedRoot) {
            roots.push(hintedRoot);
          }
        } catch (_error) {
          // Ignore invalid selector hints.
        }
      }

      const startParent = record.startXPath ? this.getParentNodeByXPath(record.startXPath) : null;
      if (startParent && !roots.includes(startParent)) {
        roots.push(startParent);
      }

      if (document.body && !roots.includes(document.body)) {
        roots.push(document.body);
      }

      return roots;
    }

    private buildTextMap(root: Node): TextMap {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const textNode = node as Text;
          if (!textNode.textContent || !textNode.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          const parentElement = textNode.parentElement;
          if (!parentElement) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parentElement.closest(`.${HIGHLIGHT_CLASS}, script, style, noscript, textarea, input`)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let text = "";
      const entries: TextEntry[] = [];
      let current = walker.nextNode();
      while (current) {
        const textNode = current as Text;
        const start = text.length;
        text += textNode.textContent || "";
        entries.push({ node: textNode, start, end: text.length });
        current = walker.nextNode();
      }

      return { text, entries };
    }

    private createRangeFromOffsets(entries: TextEntry[], startIndex: number, endIndex: number): Range | null {
      const startEntry = entries.find((entry) => startIndex >= entry.start && startIndex <= entry.end);
      const endEntry = entries.find((entry) => endIndex >= entry.start && endIndex <= entry.end);
      if (!startEntry || !endEntry) {
        return null;
      }

      const range = document.createRange();
      range.setStart(startEntry.node, startIndex - startEntry.start);
      range.setEnd(endEntry.node, endIndex - endEntry.start);
      return range;
    }

    private wrapRange(range: Range, record: HighlightRecord): void {
      const wrapper = document.createElement("mark");
      wrapper.className = `${HIGHLIGHT_CLASS} ${HIGHLIGHT_CLASS}--${record.color}`;
      wrapper.setAttribute(HIGHLIGHT_ATTR, record.id);
      wrapper.setAttribute("data-ph-color", record.color);
      if (record.customColor) {
        wrapper.style.setProperty("--ph-custom-highlight", record.customColor);
      } else {
        wrapper.style.removeProperty("--ph-custom-highlight");
      }
      wrapper.setAttribute("title", "Alt-click to remove highlight");

      const contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
      wrapper.normalize();
    }

    private unwrapHighlight(element: HTMLElement): void {
      const parent = element.parentNode;
      if (!parent) {
        return;
      }

      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
      }

      parent.removeChild(element);
      parent.normalize();
    }

    private findHighlightElement(highlightId: string): HTMLElement | null {
      return document.querySelector<HTMLElement>(`[${HIGHLIGHT_ATTR}="${CSS.escape(highlightId)}"]`);
    }

    private findHighlightElementForNode(node: Node | null): HTMLElement | null {
      if (!node) {
        return null;
      }

      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      return element?.closest(`.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
    }

    private updateHighlightElementColor(
      element: HTMLElement,
      color: HighlightColor,
      customColor?: string
    ): void {
      const colorClasses = COLOR_OPTIONS.map(({ id }) => `${HIGHLIGHT_CLASS}--${id}`);
      colorClasses.push(`${HIGHLIGHT_CLASS}--custom`);
      element.classList.remove(...colorClasses);
      element.classList.add(`${HIGHLIGHT_CLASS}--${color}`);
      element.setAttribute("data-ph-color", color);
      if (customColor) {
        element.style.setProperty("--ph-custom-highlight", customColor);
      } else {
        element.style.removeProperty("--ph-custom-highlight");
      }
    }

    private getContextSnippet(range: Range, side: "prefix" | "suffix"): string {
      const node = side === "prefix" ? range.startContainer : range.endContainer;
      if (node.nodeType !== Node.TEXT_NODE) {
        return "";
      }

      const text = node.textContent || "";
      return side === "prefix"
        ? text.slice(Math.max(0, range.startOffset - 40), range.startOffset)
        : text.slice(range.endOffset, Math.min(text.length, range.endOffset + 40));
    }

    private getXPathForNode(node: Node): string | undefined {
      const targetNode = node.nodeType === Node.TEXT_NODE ? node : node.childNodes[0] || node;
      if (!targetNode) {
        return undefined;
      }

      const segments: string[] = [];
      let current: Node | null = targetNode;
      while (current && current !== document) {
        if (current.nodeType === Node.TEXT_NODE) {
          const siblings = Array.from(current.parentNode?.childNodes || []).filter(
            (sibling) => sibling.nodeType === Node.TEXT_NODE
          );
          segments.unshift(`text()[${siblings.indexOf(current) + 1}]`);
        } else if (current.nodeType === Node.ELEMENT_NODE) {
          const element = current as Element;
          const siblings = Array.from(element.parentNode?.children || []).filter(
            (sibling) => sibling.tagName === element.tagName
          );
          segments.unshift(`${element.tagName.toLowerCase()}[${siblings.indexOf(element) + 1}]`);
        }

        current = current.parentNode;
      }

      return segments.length ? `/${segments.join("/")}` : undefined;
    }

    private getNodeByXPath(xpath: string): Node | null {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    }

    private getParentNodeByXPath(xpath: string): Node | null {
      const segments = xpath.split("/");
      segments.pop();
      const parentPath = segments.join("/");
      return parentPath ? this.getNodeByXPath(parentPath) : null;
    }

    private getNodeLength(node: Node): number {
      return node.nodeType === Node.TEXT_NODE ? (node.textContent || "").length : node.childNodes.length;
    }

    private getDomHint(node: Node): string | undefined {
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      if (!element) {
        return undefined;
      }

      const target = element.closest("article, main, section, p, li, blockquote, div") || element;
      const id = target.getAttribute("id");
      if (id) {
        return `#${CSS.escape(id)}`;
      }

      const classes = Array.from(target.classList).slice(0, 3);
      if (classes.length) {
        return `${target.tagName.toLowerCase()}.${classes.map((name) => CSS.escape(name)).join(".")}`;
      }

      return target.tagName.toLowerCase();
    }

    private isRangeHighlightable(range: Range): boolean {
      if (this.isInsideHighlight(range.commonAncestorContainer)) {
        return false;
      }

      const fragment = range.cloneContents();
      return !fragment.querySelector?.(`.${HIGHLIGHT_CLASS}, script, style, textarea, input`);
    }

    private isInsideHighlight(node: Node): boolean {
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      return Boolean(element?.closest(`.${HIGHLIGHT_CLASS}`));
    }
  }
}
