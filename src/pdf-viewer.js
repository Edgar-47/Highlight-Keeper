(function bootstrapPdfViewer(global) {
  "use strict";

  var ns = global.PersistentHighlighter;
  var pdfjs = global.pdfjsLib;
  var sourceUrl = (global.__annotateDocumentUrl || "").trim();

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(message, isError) {
    var status = $("pdf-status");
    var error = $("pdf-error");

    if (status) status.textContent = message;
    if (error) {
      error.hidden = !isError;
      if (isError) error.textContent = message;
    }
  }

  function updateHeader() {
    var title = $("pdf-title");
    var url = $("pdf-url");
    var meta = $("pdf-meta");
    var fileName = sourceUrl ? decodeURIComponent(sourceUrl.split("/").pop().split("?")[0] || "Documento PDF") : "Documento PDF";

    if (title) title.textContent = fileName;
    if (url) url.textContent = sourceUrl;
    if (meta) meta.textContent = sourceUrl ? "Selecciona texto para resaltar, crea notas flotantes o abre el panel lateral como en cualquier web." : "";
    document.title = fileName + " · Annotate PDF";
  }

  function getScale(viewportWidth) {
    var container = $("pdf-pages");
    var maxWidth = Math.max(320, Math.min((container && container.clientWidth) || window.innerWidth, 1100));
    return Math.min(2.2, Math.max(1, (maxWidth - 48) / viewportWidth));
  }

  async function renderPage(pdf, pageNumber) {
    var page = await pdf.getPage(pageNumber);
    var baseViewport = page.getViewport({ scale: 1 });
    var scale = getScale(baseViewport.width);
    var viewport = page.getViewport({ scale: scale });

    var pageEl = document.createElement("article");
    pageEl.className = "pdf-page";

    var badge = document.createElement("span");
    badge.className = "pdf-page__badge";
    badge.textContent = "Pag " + pageNumber;
    pageEl.appendChild(badge);

    var surface = document.createElement("div");
    surface.className = "pdf-page__surface";
    surface.style.width = viewport.width + "px";
    surface.style.height = viewport.height + "px";
    pageEl.appendChild(surface);

    var canvas = document.createElement("canvas");
    canvas.className = "pdf-page__canvas";
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    surface.appendChild(canvas);

    var textLayer = document.createElement("div");
    textLayer.className = "pdf-page__textLayer textLayer";
    surface.appendChild(textLayer);

    var renderTask = page.render({
      canvasContext: canvas.getContext("2d", { alpha: false }),
      viewport: viewport
    });
    await renderTask.promise;

    var textContent = await page.getTextContent();
    var textLayerTask = pdfjs.renderTextLayer({
      textContentSource: textContent,
      container: textLayer,
      viewport: viewport,
      textDivs: []
    });
    if (textLayerTask && textLayerTask.promise) {
      await textLayerTask.promise;
    }

    $("pdf-pages").appendChild(pageEl);
  }

  async function renderPdf() {
    if (!sourceUrl) {
      setStatus("No se ha indicado ninguna URL de PDF.", true);
      return;
    }

    if (!pdfjs) {
      setStatus("PDF.js no se ha cargado correctamente.", true);
      return;
    }

    $("pdf-pages").innerHTML = "";
    setStatus("Cargando PDF...");

    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("src/vendor/pdf.worker.min.js");

    var loadingTask = pdfjs.getDocument({
      url: sourceUrl,
      withCredentials: true
    });

    var pdf = await loadingTask.promise;
    setStatus("Renderizando " + pdf.numPages + " paginas...");

    for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      await renderPage(pdf, pageNumber);
      setStatus("Pagina " + pageNumber + " de " + pdf.numPages + " lista.");
    }

    setStatus("PDF listo. Puedes usar la extension igual que en una pagina web.");
    var meta = $("pdf-meta");
    if (meta) meta.textContent = pdf.numPages + " paginas renderizadas. Usa Alt+H para resaltar, Alt+N para notas y el panel lateral para organizar.";
  }

  function bindActions() {
    var reloadBtn = $("pdf-reload");
    var copyBtn = $("pdf-copy-url");

    if (reloadBtn) {
      reloadBtn.addEventListener("click", function() {
        void renderPdf().catch(function(error) {
          setStatus(error instanceof Error ? error.message : "No se pudo volver a cargar el PDF.", true);
        });
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", async function() {
        if (!sourceUrl) return;
        try {
          await navigator.clipboard.writeText(sourceUrl);
          setStatus("URL del PDF copiada.");
        } catch (_error) {
          setStatus("No se pudo copiar la URL del PDF.", true);
        }
      });
    }
  }

  updateHeader();
  bindActions();
  void renderPdf().catch(function(error) {
    setStatus(error instanceof Error ? error.message : "No se pudo abrir el PDF.", true);
  });
})(globalThis);
