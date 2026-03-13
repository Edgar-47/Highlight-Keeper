(function bootstrapHighlighter(global) {
  const namespace = global.PersistentHighlighter;

  function HighlightRenderer(storage) {
    this.storage = storage;
    this.mutationObserver = null;
    this.restoreTimerId = 0;
    this.restoreInFlight = false;
    this.lastSelectionRange = null;
  }

  HighlightRenderer.prototype.applySelectionHighlight = async function applySelectionHighlight(color, customColor) {
    const selection = window.getSelection();
    const liveRange =
      selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : null;
    const range = liveRange || (this.lastSelectionRange ? this.lastSelectionRange.cloneRange() : null);
    const selectedText = namespace.normalizeText(range ? range.toString() : "");
    if (!selectedText) {
      throw new Error("Selecciona un texto antes de resaltar.");
    }

    const resolvedCustomColor = color === "custom" ? namespace.sanitizeColorHex(customColor) : undefined;

    if (!range || !this.isRangeHighlightable(range)) {
      const selectedHighlight = this.findHighlightElementForNode(range ? range.commonAncestorContainer : null);
      if (!selectedHighlight) {
        throw new Error("No se puede resaltar esa seleccion de forma segura.");
      }

      const existingId = selectedHighlight.getAttribute(namespace.HIGHLIGHT_ATTR);
      if (!existingId) {
        throw new Error("No se pudo actualizar el resaltado seleccionado.");
      }

      const existingRecords = await this.storage.getHighlights(window.location.href);
      const existingRecord = existingRecords.find(function findById(record) {
        return record.id === existingId;
      });
      if (!existingRecord) {
        throw new Error("No se encontró el resaltado existente.");
      }

      if (existingRecord.color === color && existingRecord.customColor === resolvedCustomColor) {
        throw new Error("Ese texto ya tiene ese color.");
      }

      const updatedRecord = Object.assign({}, existingRecord, {
        color: color,
        customColor: resolvedCustomColor
      });
      this.updateHighlightElementColor(selectedHighlight, color, resolvedCustomColor);
      await this.storage.saveHighlight(updatedRecord);
      return updatedRecord;
    }

    const record = this.createRecordFromRange(
      range,
      selectedText,
      color,
      namespace.normalizeUrl(window.location.href),
      resolvedCustomColor
    );
    const existing = await this.storage.getHighlights(record.url);
    const matchingRecord = this.storage.findMatchingHighlight(existing, record);
    if (matchingRecord) {
      if (matchingRecord.color === color && matchingRecord.customColor === resolvedCustomColor) {
        throw new Error("Ese texto ya tiene ese color.");
      }

      const updatedRecord = Object.assign({}, matchingRecord, {
        color: color,
        customColor: resolvedCustomColor
      });
      const existingElement = this.findHighlightElement(matchingRecord.id);
      if (existingElement) {
        this.updateHighlightElementColor(existingElement, color, resolvedCustomColor);
      } else {
        this.wrapRange(range, updatedRecord);
      }

      if (selection) {
        selection.removeAllRanges();
      }
      await this.storage.saveHighlight(updatedRecord);
      return updatedRecord;
    }

    this.wrapRange(range, record);
    if (selection) {
      selection.removeAllRanges();
    }
    await this.storage.saveHighlight(record);
    return record;
  };

  HighlightRenderer.prototype.rememberCurrentSelection = function rememberCurrentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0).cloneRange();
    if (!namespace.normalizeText(range.toString()) || !this.isRangeHighlightable(range)) {
      return;
    }

    this.lastSelectionRange = range;
  };

  HighlightRenderer.prototype.restoreHighlightsForCurrentPage = async function restoreHighlightsForCurrentPage() {
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
        continue;
      }
    }

    return restoredCount;
  };

  HighlightRenderer.prototype.removeHighlightById = async function removeHighlightById(highlightId) {
    const target = this.findHighlightElement(highlightId);
    if (target) {
      this.unwrapHighlight(target);
    }

    await this.storage.removeHighlight(window.location.href, highlightId);
    return Boolean(target);
  };

  HighlightRenderer.prototype.clearCurrentPage = async function clearCurrentPage() {
    const elements = Array.from(document.querySelectorAll("." + namespace.HIGHLIGHT_CLASS));
    elements.forEach(
      function unwrapEach(element) {
        this.unwrapHighlight(element);
      }.bind(this)
    );

    await this.storage.clearHighlights(window.location.href);
    return elements.length;
  };

  HighlightRenderer.prototype.observeDynamicContent = function observeDynamicContent() {
    if (this.mutationObserver || !document.body) {
      return;
    }

    this.mutationObserver = new MutationObserver(
      function onMutations(mutations) {
        const shouldRestore = mutations.some(
          function hasMeaningfulMutation(mutation) {
            if (mutation.type === "characterData") {
              return !this.isInsideHighlight(mutation.target);
            }

            return Array.from(mutation.addedNodes).some(
              function hasExternalNode(node) {
                return !this.isInsideHighlight(node);
              }.bind(this)
            );
          }.bind(this)
        );

        if (!shouldRestore || this.restoreInFlight) {
          return;
        }

        window.clearTimeout(this.restoreTimerId);
        this.restoreTimerId = window.setTimeout(
          async function restoreLater() {
            this.restoreInFlight = true;
            try {
              await this.restoreHighlightsForCurrentPage();
            } finally {
              this.restoreInFlight = false;
            }
          }.bind(this),
          namespace.DYNAMIC_RESTORE_DELAY_MS
        );
      }.bind(this)
    );

    this.mutationObserver.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
  };

  HighlightRenderer.prototype.createRecordFromRange = function createRecordFromRange(
    range,
    selectedText,
    color,
    url,
    customColor
  ) {
    const prefix = this.getContextSnippet(range, "prefix");
    const suffix = this.getContextSnippet(range, "suffix");
    const domHint = this.getDomHint(range.commonAncestorContainer);

    return {
      id: namespace.createId(),
      url: url,
      selectedText: selectedText,
      color: color,
      customColor: customColor,
      createdAt: new Date().toISOString(),
      surroundingText: (prefix + selectedText + suffix).trim(),
      prefix: prefix,
      suffix: suffix,
      startXPath: this.getXPathForNode(range.startContainer),
      endXPath: this.getXPathForNode(range.endContainer),
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      domHint: domHint,
      signature: namespace.buildSignature(selectedText, prefix, suffix, domHint)
    };
  };

  HighlightRenderer.prototype.findRangeForRecord = function findRangeForRecord(record) {
    const descriptorRange = this.tryRangeFromDescriptor(record);
    if (descriptorRange) {
      return descriptorRange;
    }

    const roots = this.getSearchRoots(record);
    for (const root of roots) {
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
        if (
          range &&
          namespace.normalizeText(range.toString()) === namespace.normalizeText(record.selectedText)
        ) {
          return range;
        }

        searchIndex = matchIndex + 1;
      }
    }

    return null;
  };

  HighlightRenderer.prototype.tryRangeFromDescriptor = function tryRangeFromDescriptor(record) {
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
      return namespace.normalizeText(range.toString()) === namespace.normalizeText(record.selectedText)
        ? range
        : null;
    } catch (_error) {
      return null;
    }
  };

  HighlightRenderer.prototype.getSearchRoots = function getSearchRoots(record) {
    const roots = [];

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
    if (startParent && roots.indexOf(startParent) === -1) {
      roots.push(startParent);
    }

    if (document.body && roots.indexOf(document.body) === -1) {
      roots.push(document.body);
    }

    return roots;
  };

  HighlightRenderer.prototype.buildTextMap = function buildTextMap(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        const parentElement = node.parentElement;
        if (!parentElement) {
          return NodeFilter.FILTER_REJECT;
        }

        if (parentElement.closest("." + namespace.HIGHLIGHT_CLASS + ", script, style, noscript, textarea, input")) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let text = "";
    const entries = [];
    let current = walker.nextNode();
    while (current) {
      const start = text.length;
      text += current.textContent || "";
      entries.push({ node: current, start: start, end: text.length });
      current = walker.nextNode();
    }

    return { text: text, entries: entries };
  };

  HighlightRenderer.prototype.createRangeFromOffsets = function createRangeFromOffsets(
    entries,
    startIndex,
    endIndex
  ) {
    const startEntry = entries.find(function findStart(entry) {
      return startIndex >= entry.start && startIndex <= entry.end;
    });
    const endEntry = entries.find(function findEnd(entry) {
      return endIndex >= entry.start && endIndex <= entry.end;
    });

    if (!startEntry || !endEntry) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startEntry.node, startIndex - startEntry.start);
    range.setEnd(endEntry.node, endIndex - endEntry.start);
    return range;
  };

  HighlightRenderer.prototype.wrapRange = function wrapRange(range, record) {
    const wrapper = document.createElement("mark");
    wrapper.className = namespace.HIGHLIGHT_CLASS + " " + namespace.HIGHLIGHT_CLASS + "--" + record.color;
    wrapper.setAttribute(namespace.HIGHLIGHT_ATTR, record.id);
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
  };

  HighlightRenderer.prototype.unwrapHighlight = function unwrapHighlight(element) {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
    parent.normalize();
  };

  HighlightRenderer.prototype.findHighlightElement = function findHighlightElement(highlightId) {
    return document.querySelector(
      "[" + namespace.HIGHLIGHT_ATTR + '="' + CSS.escape(highlightId) + '"]'
    );
  };

  HighlightRenderer.prototype.findHighlightElementForNode = function findHighlightElementForNode(node) {
    if (!node) {
      return null;
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element ? element.closest("." + namespace.HIGHLIGHT_CLASS) : null;
  };

  HighlightRenderer.prototype.updateHighlightElementColor = function updateHighlightElementColor(
    element,
    color,
    customColor
  ) {
    const colorClasses = namespace.COLOR_OPTIONS.map(function mapColor(option) {
      return namespace.HIGHLIGHT_CLASS + "--" + option.id;
    });
    colorClasses.push(namespace.HIGHLIGHT_CLASS + "--custom");
    element.classList.remove.apply(element.classList, colorClasses);
    element.classList.add(namespace.HIGHLIGHT_CLASS + "--" + color);
    element.setAttribute("data-ph-color", color);
    if (customColor) {
      element.style.setProperty("--ph-custom-highlight", customColor);
    } else {
      element.style.removeProperty("--ph-custom-highlight");
    }
  };

  HighlightRenderer.prototype.getContextSnippet = function getContextSnippet(range, side) {
    const node = side === "prefix" ? range.startContainer : range.endContainer;
    if (node.nodeType !== Node.TEXT_NODE) {
      return "";
    }

    const text = node.textContent || "";
    return side === "prefix"
      ? text.slice(Math.max(0, range.startOffset - 40), range.startOffset)
      : text.slice(range.endOffset, Math.min(text.length, range.endOffset + 40));
  };

  HighlightRenderer.prototype.getXPathForNode = function getXPathForNode(node) {
    const targetNode = node.nodeType === Node.TEXT_NODE ? node : node.childNodes[0] || node;
    if (!targetNode) {
      return undefined;
    }

    const segments = [];
    let current = targetNode;
    while (current && current !== document) {
      if (current.nodeType === Node.TEXT_NODE) {
        const siblings = Array.from(current.parentNode ? current.parentNode.childNodes : []).filter(
          function isTextNode(sibling) {
            return sibling.nodeType === Node.TEXT_NODE;
          }
        );
        segments.unshift("text()[" + (siblings.indexOf(current) + 1) + "]");
      } else if (current.nodeType === Node.ELEMENT_NODE) {
        const siblings = Array.from(current.parentNode ? current.parentNode.children : []).filter(
          function sameTag(sibling) {
            return sibling.tagName === current.tagName;
          }
        );
        segments.unshift(current.tagName.toLowerCase() + "[" + (siblings.indexOf(current) + 1) + "]");
      }

      current = current.parentNode;
    }

    return segments.length ? "/" + segments.join("/") : undefined;
  };

  HighlightRenderer.prototype.getNodeByXPath = function getNodeByXPath(xpath) {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue;
  };

  HighlightRenderer.prototype.getParentNodeByXPath = function getParentNodeByXPath(xpath) {
    const segments = xpath.split("/");
    segments.pop();
    const parentPath = segments.join("/");
    return parentPath ? this.getNodeByXPath(parentPath) : null;
  };

  HighlightRenderer.prototype.getNodeLength = function getNodeLength(node) {
    return node.nodeType === Node.TEXT_NODE ? (node.textContent || "").length : node.childNodes.length;
  };

  HighlightRenderer.prototype.getDomHint = function getDomHint(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) {
      return undefined;
    }

    const target = element.closest("article, main, section, p, li, blockquote, div") || element;
    const id = target.getAttribute("id");
    if (id) {
      return "#" + CSS.escape(id);
    }

    const classes = Array.from(target.classList).slice(0, 3);
    if (classes.length) {
      return target.tagName.toLowerCase() + "." + classes.map(CSS.escape).join(".");
    }

    return target.tagName.toLowerCase();
  };

  HighlightRenderer.prototype.isRangeHighlightable = function isRangeHighlightable(range) {
    if (this.isInsideHighlight(range.commonAncestorContainer)) {
      return false;
    }

    const fragment = range.cloneContents();
    const invalidNode =
      typeof fragment.querySelector === "function"
        ? fragment.querySelector("." + namespace.HIGHLIGHT_CLASS + ", script, style, textarea, input")
        : null;

    return !invalidNode;
  };

  HighlightRenderer.prototype.isInsideHighlight = function isInsideHighlight(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element && element.closest("." + namespace.HIGHLIGHT_CLASS));
  };

  namespace.HighlightRenderer = HighlightRenderer;
})(globalThis);
