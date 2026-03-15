(function bootstrapAnnotatePdf(global) {
  "use strict";

  var params = new URLSearchParams((global.location && global.location.search) || "");
  var source = params.get("src") || "";

  global.__annotateDocumentUrl = source;
  global.__annotatePdfMode = true;

  if (global.document && global.document.documentElement) {
    global.document.documentElement.setAttribute("data-annotate-pdf", source ? "true" : "missing");
  }
})(globalThis);
