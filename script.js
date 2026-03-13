const STORAGE_THEME_KEY = "landing-theme";

const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const themeLabel = themeToggle?.querySelector(".theme-toggle__label");
const progressBar = document.getElementById("progressBar");
const yearLabel = document.getElementById("yearLabel");

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);

  if (themeLabel) {
    themeLabel.textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
  }

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  }
}

function setupThemeToggle() {
  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);

  themeToggle?.addEventListener("click", () => {
    const nextTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_THEME_KEY, nextTheme);
    applyTheme(nextTheme);
  });
}

function setupRevealAnimations() {
  const revealElements = document.querySelectorAll(".reveal");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const delay = entry.target.getAttribute("data-delay") || "0";
        entry.target.style.setProperty("--reveal-delay", `${delay}ms`);
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16 }
  );

  revealElements.forEach((element) => observer.observe(element));
}

function setupCounters() {
  const counters = document.querySelectorAll("[data-counter]");

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.target.dataset.counted === "true") {
          return;
        }

        entry.target.dataset.counted = "true";
        const targetValue = Number(entry.target.getAttribute("data-counter"));
        const duration = 1200;
        const startTime = performance.now();

        // Contadores suaves sin depender de librerias.
        function updateCounter(now) {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const currentValue = Math.round(targetValue * eased);
          entry.target.textContent = String(currentValue);

          if (progress < 1) {
            requestAnimationFrame(updateCounter);
            return;
          }

          if (targetValue === 100) {
            entry.target.textContent = "100%";
          }
        }

        requestAnimationFrame(updateCounter);
        counterObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((counter) => counterObserver.observe(counter));
}

function setupProgressBar() {
  if (!progressBar) {
    return;
  }

  function updateProgress() {
    const scrollTop = window.scrollY;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    progressBar.style.width = `${progress}%`;
  }

  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
}

function setupTiltCards() {
  const tiltCards = document.querySelectorAll("[data-tilt]");

  tiltCards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
      const offsetY = (event.clientY - rect.top) / rect.height - 0.5;
      const rotateY = offsetX * 8;
      const rotateX = offsetY * -8;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    });
  });
}

function setupYear() {
  if (yearLabel) {
    yearLabel.textContent = String(new Date().getFullYear());
  }
}

setupThemeToggle();
setupRevealAnimations();
setupCounters();
setupProgressBar();
setupTiltCards();
setupYear();
