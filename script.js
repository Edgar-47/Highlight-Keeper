(() => {
  "use strict";

  // Claves y valores base.
  const STORAGE_THEME_KEY = "landing-theme";
  const THEMES = {
    light: "light",
    dark: "dark",
  };

  // Colores del navegador por tema.
  const THEME_COLORS = {
    light: "#17130f",
    dark: "#161922",
  };

  // Cache simple del DOM.
  const root = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = themeToggle?.querySelector(".theme-toggle__label");
  const progressBar = document.getElementById("progressBar");
  const yearLabel = document.getElementById("yearLabel");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const reducedMotionQuery = safeMatchMedia("(prefers-reduced-motion: reduce)");
  const finePointerQuery = safeMatchMedia("(hover: hover) and (pointer: fine)");
  const systemThemeQuery = safeMatchMedia("(prefers-color-scheme: dark)");
  const abortController = typeof AbortController === "function" ? new AbortController() : null;

  // Atajo para listeners cancelables.
  function getListenerOptions(extraOptions = {}) {
    if (!abortController) {
      return extraOptions;
    }

    return {
      ...extraOptions,
      signal: abortController.signal,
    };
  }

  // Envoltorio defensivo para cada modulo.
  function safelyRun(label, callback) {
    try {
      callback();
    } catch (error) {
      console.error(`[landing] ${label}`, error);
    }
  }

  // Fallback si matchMedia no existe o falla.
  function safeMatchMedia(query) {
    try {
      if (typeof window.matchMedia !== "function") {
        return null;
      }

      return window.matchMedia(query);
    } catch {
      return null;
    }
  }

  // Fallback si localStorage esta bloqueado.
  function getSafeStorage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  // Lee datos persistentes sin romper la pagina.
  function readStoredValue(key) {
    const storage = getSafeStorage();
    if (!storage) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  // Guarda datos solo si el entorno lo permite.
  function writeStoredValue(key, value) {
    const storage = getSafeStorage();
    if (!storage) {
      return false;
    }

    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  // Borra datos guardados sin lanzar excepciones.
  function removeStoredValue(key) {
    const storage = getSafeStorage();
    if (!storage) {
      return false;
    }

    try {
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  // Limita numeros para evitar valores raros.
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // Valida nombres de tema.
  function normalizeTheme(value) {
    return value === THEMES.dark ? THEMES.dark : THEMES.light;
  }

  // Lee preferencia guardada.
  function getStoredTheme() {
    const savedTheme = readStoredValue(STORAGE_THEME_KEY);
    return savedTheme === THEMES.light || savedTheme === THEMES.dark ? savedTheme : null;
  }

  // Lee el tema del sistema.
  function getSystemTheme() {
    return systemThemeQuery?.matches ? THEMES.dark : THEMES.light;
  }

  // Decide el tema inicial.
  function getPreferredTheme() {
    return getStoredTheme() || getSystemTheme();
  }

  // Aplica el tema al DOM.
  function applyTheme(theme, options = {}) {
    const normalizedTheme = normalizeTheme(theme);
    const shouldPersist = options.persist === true;
    const shouldClearStoredTheme = options.clearStoredTheme === true;

    root.setAttribute("data-theme", normalizedTheme);
    root.style.colorScheme = normalizedTheme;

    if (themeLabel) {
      themeLabel.textContent = normalizedTheme === THEMES.dark ? "Modo claro" : "Modo oscuro";
    }

    if (themeToggle) {
      themeToggle.setAttribute("aria-pressed", String(normalizedTheme === THEMES.dark));
      themeToggle.dataset.theme = normalizedTheme;
    }

    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", THEME_COLORS[normalizedTheme]);
    }

    if (shouldPersist) {
      writeStoredValue(STORAGE_THEME_KEY, normalizedTheme);
    }

    if (shouldClearStoredTheme) {
      removeStoredValue(STORAGE_THEME_KEY);
    }
  }

  // Indica si debemos reducir efectos.
  function prefersReducedMotion() {
    return reducedMotionQuery?.matches === true;
  }

  // Fallback seguro para requestAnimationFrame.
  function onNextFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }

    return window.setTimeout(() => callback(Date.now()), 16);
  }

  // Inicializa el cambio de tema.
  function setupThemeToggle() {
    applyTheme(getPreferredTheme());

    if (!themeToggle) {
      return;
    }

    themeToggle.addEventListener(
      "click",
      () => {
        const nextTheme = root.getAttribute("data-theme") === THEMES.dark ? THEMES.light : THEMES.dark;
        applyTheme(nextTheme, { persist: true });
      },
      getListenerOptions()
    );

    if (!systemThemeQuery) {
      return;
    }

    const handleSystemThemeChange = () => {
      // Solo seguimos el sistema si el usuario no eligio uno manualmente.
      if (getStoredTheme()) {
        return;
      }

      applyTheme(getSystemTheme(), { clearStoredTheme: true });
    };

    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", handleSystemThemeChange, getListenerOptions());
      return;
    }

    if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(handleSystemThemeChange);
      window.addEventListener(
        "pagehide",
        () => {
          systemThemeQuery.removeListener(handleSystemThemeChange);
        },
        getListenerOptions({ once: true })
      );
    }
  }

  // Hace visibles los elementos con reveal.
  function revealAllElements(elements) {
    elements.forEach((element) => {
      element.classList.add("is-visible");
    });
  }

  // Carga animaciones de entrada de forma defensiva.
  function setupRevealAnimations() {
    const revealElements = Array.from(document.querySelectorAll(".reveal"));
    if (revealElements.length === 0) {
      return;
    }

    if (prefersReducedMotion() || typeof IntersectionObserver !== "function") {
      revealAllElements(revealElements);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const rawDelay = Number(entry.target.getAttribute("data-delay") || "0");
          const delay = Number.isFinite(rawDelay) ? clamp(rawDelay, 0, 1600) : 0;

          entry.target.style.setProperty("--reveal-delay", `${delay}ms`);
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16 }
    );

    revealElements.forEach((element) => observer.observe(element));

    window.addEventListener(
      "pagehide",
      () => {
        observer.disconnect();
      },
      getListenerOptions({ once: true })
    );
  }

  // Devuelve el texto final de un contador.
  function formatCounterValue(value, suffix) {
    return `${value}${suffix || ""}`;
  }

  // Aplica contadores animados con fallback.
  function setupCounters() {
    const counters = Array.from(document.querySelectorAll("[data-counter]"));
    if (counters.length === 0) {
      return;
    }

    const setCounterFinalValue = (counter) => {
      const targetValue = Number(counter.getAttribute("data-counter"));
      const safeValue = Number.isFinite(targetValue) ? Math.max(targetValue, 0) : 0;
      const suffix = counter.getAttribute("data-counter-suffix") || "";
      counter.textContent = formatCounterValue(safeValue, suffix);
    };

    if (prefersReducedMotion() || typeof IntersectionObserver !== "function") {
      counters.forEach(setCounterFinalValue);
      return;
    }

    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.target.dataset.counted === "true") {
            return;
          }

          entry.target.dataset.counted = "true";

          const targetValue = Number(entry.target.getAttribute("data-counter"));
          const safeTargetValue = Number.isFinite(targetValue) ? Math.max(targetValue, 0) : 0;
          const suffix = entry.target.getAttribute("data-counter-suffix") || "";
          const duration = 1200;
          const startTime = performance.now();

          // Contador suave y acotado.
          function updateCounter(now) {
            const progress = clamp((now - startTime) / duration, 0, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.round(safeTargetValue * eased);
            entry.target.textContent = formatCounterValue(currentValue, progress >= 1 ? suffix : "");

            if (progress < 1) {
              onNextFrame(updateCounter);
              return;
            }

            entry.target.textContent = formatCounterValue(safeTargetValue, suffix);
          }

          onNextFrame(updateCounter);
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.45 }
    );

    counters.forEach((counter) => counterObserver.observe(counter));

    window.addEventListener(
      "pagehide",
      () => {
        counterObserver.disconnect();
      },
      getListenerOptions({ once: true })
    );
  }

  // Controla la barra superior sin saturar el scroll.
  function setupProgressBar() {
    if (!progressBar) {
      return;
    }

    let rafId = 0;

    const updateProgress = () => {
      rafId = 0;

      const scrollTop = window.scrollY || window.pageYOffset || 0;
      const scrollHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      const progress = scrollHeight > 0 ? clamp((scrollTop / scrollHeight) * 100, 0, 100) : 0;

      progressBar.style.width = `${progress}%`;
    };

    const requestProgressUpdate = () => {
      if (rafId !== 0) {
        return;
      }

      rafId = onNextFrame(updateProgress);
    };

    updateProgress();

    window.addEventListener("scroll", requestProgressUpdate, getListenerOptions({ passive: true }));
    window.addEventListener("resize", requestProgressUpdate, getListenerOptions({ passive: true }));
    window.addEventListener("orientationchange", requestProgressUpdate, getListenerOptions({ passive: true }));
    window.addEventListener("load", requestProgressUpdate, getListenerOptions({ once: true }));
  }

  // Activa el efecto tilt solo donde tiene sentido.
  function setupTiltCards() {
    if (prefersReducedMotion() || finePointerQuery?.matches === false) {
      return;
    }

    const tiltCards = Array.from(document.querySelectorAll("[data-tilt]"));
    if (tiltCards.length === 0) {
      return;
    }

    tiltCards.forEach((card) => {
      const resetTilt = () => {
        card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
      };

      card.addEventListener(
        "pointermove",
        (event) => {
          const rect = card.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return;
          }

          const offsetX = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
          const offsetY = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
          const rotateY = offsetX * 8;
          const rotateX = offsetY * -8;

          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        },
        getListenerOptions({ passive: true })
      );

      card.addEventListener("pointerleave", resetTilt, getListenerOptions());
      card.addEventListener("pointercancel", resetTilt, getListenerOptions());
      card.addEventListener("focusout", resetTilt, getListenerOptions());
    });
  }

  // Pinta el ano actual.
  function setupYear() {
    if (yearLabel) {
      yearLabel.textContent = String(new Date().getFullYear());
    }
  }

  // Limpieza de listeners modernos.
  function setupLifecycleCleanup() {
    if (!abortController) {
      return;
    }

    window.addEventListener(
      "pagehide",
      () => {
        abortController.abort();
      },
      { once: true }
    );
  }

  // Arranque agrupado.
  function init() {
    safelyRun("theme", setupThemeToggle);
    safelyRun("reveal", setupRevealAnimations);
    safelyRun("counters", setupCounters);
    safelyRun("progress", setupProgressBar);
    safelyRun("tilt", setupTiltCards);
    safelyRun("year", setupYear);
    safelyRun("cleanup", setupLifecycleCleanup);
  }

  // Arranque seguro en cualquier estado.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
