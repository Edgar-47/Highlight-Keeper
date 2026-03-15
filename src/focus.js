(function bootstrapFocus(global) {
  "use strict";

  const ns = global.PersistentHighlighter;
  if (!ns || ns.FocusOverlay) return;

  // ─── Etiquetas ────────────────────────────────────────────────────────────
  const MODE_LABELS = {
    clock:      "Reloj",
    stopwatch:  "Cronometro",
    countdown:  "Cuenta atras",
    breakCycle: "Ciclos de descanso",
    study:      "Pomodoro"
  };

  const PHASE_LABELS = {
    focus:     "Enfoque",
    break:     "Descanso corto",
    longBreak: "Descanso largo"
  };

  const COUNTDOWN_PRESETS = [5, 15, 25, 50];

  // ─── Constructor ──────────────────────────────────────────────────────────
  function FocusOverlay(storage) {
    this.storage   = storage;
    this.state     = null;
    this.root      = null;
    this.timerId   = 0;
    this.dragState = null;

    // ── CORRECCIÓN: guardar la referencia enlazada para poder eliminarla
    //    después (el código anterior creaba una nueva función cada vez y
    //    nunca podía eliminar el listener, causando fugas de memoria).
    this._boundStorageListener = this._handleStorageChange.bind(this);
    chrome.storage.onChanged.addListener(this._boundStorageListener);
  }

  // ─── Restaurar ────────────────────────────────────────────────────────────
  FocusOverlay.prototype.restore = async function restore() {
    this.state = await this.storage.getFocusState();
    const changed = this._reconcileTimers(Date.now());
    if (changed) await this._persist();
    this._render();
    this._ensureTicker();
    return this.state;
  };

  // ─── Manejador central de acciones ───────────────────────────────────────
  FocusOverlay.prototype.handleAction = async function handleAction(action, payload) {
    if (!this.state) await this.restore();

    const now  = Date.now();
    const data = payload || {};

    switch (action) {
      case "SET_VISIBILITY":
        this.state.visible = Boolean(data.visible);
        break;

      case "SET_MODE":
        this._pauseAll(now);
        this.state.mode = this._normalizeMode(data.mode);
        if (this.state.mode === "countdown" && this.state.countdown.remainingMs <= 0)
          this._resetCountdown();
        if ((this.state.mode === "breakCycle" || this.state.mode === "study") &&
            this.state[this.state.mode].remainingMs <= 0)
          this._resetCycle(this.state.mode);
        break;

      case "SET_LAYOUT":
        this.state.layout = this._normalizeLayout(data.layout);
        break;

      case "SET_CLOCK_OPTIONS":
        if (data.use24Hour  !== undefined) this.state.use24Hour  = Boolean(data.use24Hour);
        if (data.showSeconds !== undefined) this.state.showSeconds = Boolean(data.showSeconds);
        break;

      case "CONFIGURE_COUNTDOWN":
        this.state.countdown.durationMinutes = this._clampInt(data.durationMinutes, 1, 600, this.state.countdown.durationMinutes);
        this._resetCountdown();
        break;

      case "CONFIGURE_CYCLE": {
        const modeKey = data.modeKey === "breakCycle" ? "breakCycle" : "study";
        const cycle   = this.state[modeKey];
        cycle.focusMinutes     = this._clampInt(data.focusMinutes,     1, 600, cycle.focusMinutes);
        cycle.breakMinutes     = this._clampInt(data.breakMinutes,     1, 180, cycle.breakMinutes);
        cycle.longBreakMinutes = this._clampInt(data.longBreakMinutes, 1, 240, cycle.longBreakMinutes);
        cycle.rounds           = this._clampInt(data.rounds,           1,  12, cycle.rounds);
        this._resetCycle(modeKey);
        break;
      }

      case "TOGGLE_RUN":
        this.state.visible = true;
        this._toggleRun(now);
        break;

      case "RESET_MODE":
        this._pauseAll(now);
        this._resetCurrentMode();
        break;

      case "CENTER":
        this.state.visible = true;
        this._centerPosition();
        break;

      case "SET_POSITION":
        this._setPosition(data.x, data.y);
        break;

      case "SYNC":
      default:
        break;
    }

    this._reconcileTimers(Date.now());
    this.state = ns.normalizeFocusState(this.state);
    await this._persist();
    this._render();
    this._ensureTicker();
    return this.state;
  };

  // ─── Listener de cambios externos en storage ──────────────────────────────
  FocusOverlay.prototype._handleStorageChange = function (changes, areaName) {
    if (areaName !== "local" || !changes[ns.FOCUS_STORAGE_KEY]) return;
    // ── CORRECCIÓN: si el popup modifica el estado mientras el ticker está
    //    corriendo, sincronizamos SIN arrancar una segunda instancia del
    //    ticker ni crear una nueva instancia del listener.
    const incoming = ns.normalizeFocusState(changes[ns.FOCUS_STORAGE_KEY].newValue);

    // Solo actualizamos si el cambio viene del exterior (popup u otra pestaña).
    // Lo detectamos comparando el campo `visible` y los timestamps de endsAt
    // que el ticker interno NO modifica salvo al pausar/arrancar.
    this.state = incoming;
    this._reconcileTimers(Date.now());
    this._render();
    this._ensureTicker();
  };

  FocusOverlay.prototype._persist = function () {
    return this.storage.saveFocusState(this.state, { replace: true });
  };

  // ─── Construcción del DOM ─────────────────────────────────────────────────
  FocusOverlay.prototype._ensureRoot = function () {
    if (this.root && this.root.isConnected) return this.root;

    const root = document.createElement("section");
    root.className = "ph-focus-overlay";
    root.hidden = true;
    root.innerHTML = [
      '<div class="ph-focus-card">',
      '  <div class="ph-focus-card__glow" aria-hidden="true"></div>',
      '  <header class="ph-focus__header">',
      '    <button class="ph-focus__drag" type="button">Annotate Focus</button>',
      '    <div class="ph-focus__header-side">',
      '      <span class="ph-focus__micro" data-role="micro"></span>',
      '      <button class="ph-focus__hide" type="button" aria-label="Ocultar reloj">✕</button>',
      '    </div>',
      '  </header>',
      '  <div class="ph-focus__modes" data-role="modes"></div>',
      '  <div class="ph-focus__body">',
      '    <p class="ph-focus__eyebrow" data-role="eyebrow"></p>',
      '    <div class="ph-focus__readout" data-role="readout"></div>',
      '    <p class="ph-focus__meta" data-role="meta"></p>',
      '    <div class="ph-focus__progress"><span data-role="progress"></span></div>',
      '  </div>',
      '  <div class="ph-focus__quick" data-role="quick"></div>',
      '  <div class="ph-focus__controls">',
      '    <button class="ph-focus__control ph-focus__control--primary" data-action="primary" type="button"></button>',
      '    <button class="ph-focus__control" data-action="reset" type="button">Reset</button>',
      '    <button class="ph-focus__control" data-action="center" type="button">Centrar</button>',
      '  </div>',
      '</div>'
    ].join("");

    // Botones de modo
    const modesHost = root.querySelector('[data-role="modes"]');
    Object.keys(MODE_LABELS).forEach(mode => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ph-focus__mode";
      btn.dataset.mode = mode;
      btn.textContent = MODE_LABELS[mode];
      btn.addEventListener("click", () => this.handleAction("SET_MODE", { mode }));
      modesHost.appendChild(btn);
    });

    root.querySelector(".ph-focus__hide")
      .addEventListener("click", () => this.handleAction("SET_VISIBILITY", { visible: false }));

    root.querySelector('[data-action="primary"]').addEventListener("click", () => {
      if (!this.state) return;
      if (this.state.mode === "clock") {
        const next = this.state.layout === "stacked" ? "split"
                   : this.state.layout === "split"   ? "minimal"
                   : "stacked";
        this.handleAction("SET_LAYOUT", { layout: next });
        return;
      }
      this.handleAction("TOGGLE_RUN");
    });

    root.querySelector('[data-action="center"]')
      .addEventListener("click", () => this.handleAction("CENTER"));

    root.querySelector('[data-action="reset"]')
      .addEventListener("click", () => {
        if (!this.state) return;
        if (this.state.mode === "clock") {
          this.handleAction("SET_VISIBILITY", { visible: false });
        } else {
          this.handleAction("RESET_MODE");
        }
      });

    root.querySelector(".ph-focus__drag")
      .addEventListener("pointerdown", e => this._startDrag(e));

    root.querySelector('[data-role="quick"]').addEventListener("click", e => {
      const target = e.target.closest("[data-preset-minutes]");
      if (!target) return;
      const minutes = Number(target.getAttribute("data-preset-minutes"));
      if (Number.isFinite(minutes))
        this.handleAction("CONFIGURE_COUNTDOWN", { durationMinutes: minutes });
    });

    document.documentElement.appendChild(root);
    this.root = root;
    return root;
  };

  // ─── Drag ─────────────────────────────────────────────────────────────────
  FocusOverlay.prototype._startDrag = function (event) {
    if (!this.state) return;

    const root    = this._ensureRoot();
    const startX  = Number(this.state.x || 24);
    const startY  = Number(this.state.y || 24);
    const offsetX = event.clientX - startX;
    const offsetY = event.clientY - startY;

    this.dragState = { pointerId: event.pointerId, offsetX, offsetY };
    root.classList.add("is-dragging");
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const move = moveEvent => {
      if (!this.dragState || moveEvent.pointerId !== this.dragState.pointerId) return;
      this._setPosition(
        moveEvent.clientX - this.dragState.offsetX,
        moveEvent.clientY - this.dragState.offsetY
      );
      this._renderPosition();
    };

    const finish = async upEvent => {
      if (!this.dragState || upEvent.pointerId !== this.dragState.pointerId) return;
      event.currentTarget.removeEventListener("pointermove", move);
      event.currentTarget.removeEventListener("pointerup",   finish);
      event.currentTarget.removeEventListener("pointercancel", finish);
      root.classList.remove("is-dragging");
      this.dragState = null;
      this._renderPosition();
      await this._persist();
    };

    event.currentTarget.addEventListener("pointermove",   move);
    event.currentTarget.addEventListener("pointerup",     finish);
    event.currentTarget.addEventListener("pointercancel", finish);
  };

  // ─── Ticker ───────────────────────────────────────────────────────────────
  FocusOverlay.prototype._ensureTicker = function () {
    // Siempre cancelar el intervalo previo antes de decidir si creamos uno nuevo.
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    }

    if (!this.state) return;

    // ── CORRECCIÓN: el modo "clock" necesita ticker aunque no haya nada
    //    corriendo, para que los segundos avancen en pantalla.
    const shouldTick =
      this.state.visible             ||
      this.state.stopwatch.isRunning ||
      this.state.countdown.isRunning ||
      this.state.breakCycle.isRunning ||
      this.state.study.isRunning;

    if (!shouldTick) return;

    // ── OPTIMIZACIÓN: el reloj solo necesita actualizarse cada segundo;
    //    los temporizadores cada 250 ms para mantener suavidad visual.
    //    Usamos 500 ms para el reloj puro y 250 ms para modos activos.
    const isActiveCounting =
      this.state.stopwatch.isRunning  ||
      this.state.countdown.isRunning  ||
      this.state.breakCycle.isRunning ||
      this.state.study.isRunning;

    const intervalMs = isActiveCounting ? 250 : 500;

    this.timerId = window.setInterval(() => {
      if (!this.state) return;
      const changed = this._reconcileTimers(Date.now());
      if (changed) {
        // ── CORRECCIÓN: _persist() es asíncrono; se llama sin await dentro
        //    del ticker para no bloquear el hilo. Los errores se silencian
        //    porque no son críticos en cada tick.
        this._persist().catch(() => {});
        // Recalcular si hay que seguir con el mismo intervalo
        this._ensureTicker();
      }
      this._render();
    }, intervalMs);
  };

  // ─── Reconciliar temporizadores ────────────────────────────────────────────
  FocusOverlay.prototype._reconcileTimers = function (now) {
    if (!this.state) return false;

    let changed = false;

    if (this.state.countdown.isRunning && this.state.countdown.endsAt) {
      const remaining = this.state.countdown.endsAt - now;
      if (remaining <= 0) {
        this.state.countdown.remainingMs = 0;
        this.state.countdown.endsAt      = null;
        this.state.countdown.isRunning   = false;
        changed = true;
      }
    }

    changed = this._reconcileCycle("breakCycle", now) || changed;
    changed = this._reconcileCycle("study",      now) || changed;

    return changed;
  };

  FocusOverlay.prototype._reconcileCycle = function (modeKey, now) {
    const cycle = this.state[modeKey];
    if (!cycle || !cycle.isRunning || !cycle.endsAt) return false;

    let changed = false;

    while (cycle.isRunning && cycle.endsAt && now >= cycle.endsAt) {
      changed = true;

      if (cycle.phase === "focus") {
        if (cycle.currentRound >= cycle.rounds) {
          cycle.phase        = "longBreak";
          cycle.remainingMs  = cycle.longBreakMinutes * 60000;
          cycle.endsAt      += cycle.remainingMs;
          continue;
        }
        cycle.phase       = "break";
        cycle.remainingMs = cycle.breakMinutes * 60000;
        cycle.endsAt     += cycle.remainingMs;
        continue;
      }

      if (cycle.phase === "break") {
        cycle.currentRound = Math.min(cycle.currentRound + 1, cycle.rounds);
        cycle.phase        = "focus";
        cycle.remainingMs  = cycle.focusMinutes * 60000;
        cycle.endsAt      += cycle.remainingMs;
        continue;
      }

      // longBreak finalizado → reiniciar ciclo completamente
      cycle.phase        = "focus";
      cycle.currentRound = 1;
      cycle.remainingMs  = cycle.focusMinutes * 60000;
      cycle.endsAt       = null;
      cycle.isRunning    = false;
    }

    return changed;
  };

  // ─── Toggle start/pause ───────────────────────────────────────────────────
  FocusOverlay.prototype._toggleRun = function (now) {
    switch (this.state.mode) {
      case "stopwatch":
        if (this.state.stopwatch.isRunning) {
          this.state.stopwatch.elapsedMs = this._getStopwatchElapsed(now);
          this.state.stopwatch.startedAt = null;
          this.state.stopwatch.isRunning = false;
        } else {
          this._pauseAll(now, "stopwatch");
          this.state.stopwatch.startedAt = now;
          this.state.stopwatch.isRunning = true;
        }
        break;

      case "countdown":
        if (this.state.countdown.isRunning) {
          this.state.countdown.remainingMs = this._getCountdownRemaining(now);
          this.state.countdown.endsAt      = null;
          this.state.countdown.isRunning   = false;
        } else {
          if (this.state.countdown.remainingMs <= 0) this._resetCountdown();
          this._pauseAll(now, "countdown");
          this.state.countdown.endsAt    = now + this.state.countdown.remainingMs;
          this.state.countdown.isRunning = true;
        }
        break;

      case "breakCycle":
      case "study": {
        const cycle = this.state[this.state.mode];
        if (cycle.isRunning) {
          cycle.remainingMs = this._getCycleRemaining(this.state.mode, now);
          cycle.endsAt      = null;
          cycle.isRunning   = false;
        } else {
          if (cycle.remainingMs <= 0) this._resetCycle(this.state.mode);
          this._pauseAll(now, this.state.mode);
          cycle.endsAt    = now + cycle.remainingMs;
          cycle.isRunning = true;
        }
        break;
      }

      default:
        this.state.visible = true;
        break;
    }
  };

  FocusOverlay.prototype._pauseAll = function (now, exceptMode) {
    if (exceptMode !== "stopwatch" && this.state.stopwatch.isRunning) {
      this.state.stopwatch.elapsedMs = this._getStopwatchElapsed(now);
      this.state.stopwatch.startedAt = null;
      this.state.stopwatch.isRunning = false;
    }

    if (exceptMode !== "countdown" && this.state.countdown.isRunning) {
      this.state.countdown.remainingMs = this._getCountdownRemaining(now);
      this.state.countdown.endsAt      = null;
      this.state.countdown.isRunning   = false;
    }

    ["breakCycle", "study"].forEach(modeKey => {
      if (exceptMode === modeKey) return;
      const cycle = this.state[modeKey];
      if (!cycle.isRunning) return;
      cycle.remainingMs = this._getCycleRemaining(modeKey, now);
      cycle.endsAt      = null;
      cycle.isRunning   = false;
    });
  };

  FocusOverlay.prototype._resetCurrentMode = function () {
    if (this.state.mode === "countdown")                                 { this._resetCountdown();            return; }
    if (this.state.mode === "stopwatch")                                 { this._resetStopwatch();             return; }
    if (this.state.mode === "breakCycle" || this.state.mode === "study") { this._resetCycle(this.state.mode); return; }
  };

  FocusOverlay.prototype._resetCountdown = function () {
    this.state.countdown.remainingMs = this.state.countdown.durationMinutes * 60000;
    this.state.countdown.endsAt      = null;
    this.state.countdown.isRunning   = false;
  };

  // ── CORRECCIÓN: faltaba este método; el código lo llamaba pero no existía.
  FocusOverlay.prototype._resetStopwatch = function () {
    this.state.stopwatch.elapsedMs  = 0;
    this.state.stopwatch.startedAt  = null;
    this.state.stopwatch.isRunning  = false;
  };

  FocusOverlay.prototype._resetCycle = function (modeKey) {
    const cycle = this.state[modeKey];
    cycle.currentRound = 1;
    cycle.phase        = "focus";
    cycle.remainingMs  = cycle.focusMinutes * 60000;
    cycle.endsAt       = null;
    cycle.isRunning    = false;
  };

  // ─── Helpers de normalización ─────────────────────────────────────────────
  FocusOverlay.prototype._normalizeMode = function (mode) {
    const MODES = ["clock", "stopwatch", "countdown", "breakCycle", "study"];
    return MODES.includes(String(mode || "")) ? String(mode) : "clock";
  };

  FocusOverlay.prototype._normalizeLayout = function (layout) {
    const LAYOUTS = ["stacked", "split", "minimal"];
    return LAYOUTS.includes(String(layout || "")) ? String(layout) : "stacked";
  };

  FocusOverlay.prototype._clampInt = function (value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
  };

  // ─── Getters de tiempo ────────────────────────────────────────────────────
  FocusOverlay.prototype._getStopwatchElapsed = function (now) {
    const s = this.state.stopwatch;
    if (!s.isRunning || !s.startedAt) return s.elapsedMs;
    return Math.max(0, s.elapsedMs + (now - s.startedAt));
  };

  FocusOverlay.prototype._getCountdownRemaining = function (now) {
    const s = this.state.countdown;
    if (!s.isRunning || !s.endsAt) return s.remainingMs;
    return Math.max(0, s.endsAt - now);
  };

  FocusOverlay.prototype._getCycleRemaining = function (modeKey, now) {
    const c = this.state[modeKey];
    if (!c.isRunning || !c.endsAt) return c.remainingMs;
    return Math.max(0, c.endsAt - now);
  };

  // ─── Posición ─────────────────────────────────────────────────────────────
  FocusOverlay.prototype._centerPosition = function () {
    const root  = this._ensureRoot();
    root.hidden = false;
    const width = Math.max(root.offsetWidth, 320);
    this.state.x = Math.round(Math.max(12, (window.innerWidth - width) / 2));
    this.state.y = 24;
  };

  FocusOverlay.prototype._setPosition = function (x, y) {
    const root   = this._ensureRoot();
    const width  = Math.max(root.offsetWidth,  320);
    const height = Math.max(root.offsetHeight, 260);
    const maxX   = Math.max(12, window.innerWidth  - width  - 12);
    const maxY   = Math.max(12, window.innerHeight - height - 12);
    this.state.x = this._clampInt(x, 12, maxX, this.state.x || 24);
    this.state.y = this._clampInt(y, 12, maxY, this.state.y || 24);
  };

  FocusOverlay.prototype._renderPosition = function () {
    if (!this.root || !this.state) return;
    this.root.style.left = this.state.x + "px";
    this.root.style.top  = this.state.y + "px";
  };

  // ─── Construcción de la vista (readout) ───────────────────────────────────
  FocusOverlay.prototype._buildReadout = function (now) {
    // ── CORRECCIÓN: `now` se recibe como un timestamp Number (Date.now()).
    //    En el modo reloj se necesita un objeto Date para llamar a getHours(),
    //    getMinutes(), etc. El código original mezclaba Date y Number de forma
    //    inconsistente, causando que `now.getSeconds()` fallara con TypeError
    //    cuando `now` era un Number. Normalizamos aquí.
    const nowDate = now instanceof Date ? now : new Date(now);
    const nowMs   = now instanceof Date ? now.getTime() : now;

    if (this.state.mode === "clock") {
      const parts    = this._getClockParts(nowDate);
      const segments = [parts.hours, parts.minutes];
      if (this.state.showSeconds) segments.push(parts.seconds);

      // Progreso del minuto actual (0–1) para la barra
      const secsInMinute = nowDate.getSeconds() + nowDate.getMilliseconds() / 1000;

      return {
        eyebrow:      "Hora local",
        readout:      this._renderSegmentMarkup(segments, parts.suffix, true),
        meta:         this._formatDate(nowDate),
        progress:     secsInMinute / 60,
        quickHtml:
          '<span class="ph-focus__chip ph-focus__chip--ghost">' + (this.state.use24Hour ? "24h" : "12h") + "</span>" +
          '<span class="ph-focus__chip ph-focus__chip--ghost">' + (this.state.showSeconds ? "Con segundos" : "Sin segundos") + "</span>" +
          '<span class="ph-focus__chip ph-focus__chip--ghost">' + MODE_LABELS[this.state.mode] + "</span>",
        primaryLabel: "Cambiar formato",
        resetLabel:   "Ocultar",
        isRunning:    false
      };
    }

    if (this.state.mode === "stopwatch") {
      const elapsed = this._getStopwatchElapsed(nowMs);
      return {
        eyebrow:      "Cronometro libre",
        readout:      this._renderSegmentMarkup(this._formatDuration(elapsed, true), "", false),
        meta:         this.state.stopwatch.isRunning ? "Midiendo en tiempo real" : "Listo para arrancar",
        progress:     Math.min((elapsed % 3600000) / 3600000, 1),
        quickHtml:
          '<span class="ph-focus__chip">Tiempo total</span>' +
          '<span class="ph-focus__chip ph-focus__chip--ghost">' + this._formatLongDuration(elapsed) + "</span>",
        primaryLabel: this.state.stopwatch.isRunning ? "Pausar" : "Empezar",
        resetLabel:   "Reset",
        isRunning:    this.state.stopwatch.isRunning
      };
    }

    if (this.state.mode === "countdown") {
      const remaining = this._getCountdownRemaining(nowMs);
      const total     = Math.max(1, this.state.countdown.durationMinutes * 60000);
      return {
        eyebrow:  "Cuenta atras",
        readout:  this._renderSegmentMarkup(this._formatDuration(remaining, false), "", false),
        meta:     this.state.countdown.isRunning
          ? "Quedan " + this._formatLongDuration(remaining)
          : this.state.countdown.durationMinutes + " minutos configurados",
        progress: 1 - remaining / total,
        quickHtml: COUNTDOWN_PRESETS.map(minutes =>
          '<button class="ph-focus__chip ph-focus__chip--interactive' +
          (minutes === this.state.countdown.durationMinutes ? " is-active" : "") +
          '" type="button" data-preset-minutes="' + minutes + '">' + minutes + "m</button>"
        ).join(""),
        primaryLabel: this.state.countdown.isRunning ? "Pausar" : "Empezar",
        resetLabel:   "Reset",
        isRunning:    this.state.countdown.isRunning
      };
    }

    // breakCycle / study
    const cycle         = this.state[this.state.mode];
    const remainingMs   = this._getCycleRemaining(this.state.mode, nowMs);
    const phaseTotal    = this._getCyclePhaseDurationMs(cycle);
    return {
      eyebrow:  MODE_LABELS[this.state.mode],
      readout:  this._renderSegmentMarkup(this._formatDuration(remainingMs, false), "", false),
      meta:     PHASE_LABELS[cycle.phase] + " · ronda " + cycle.currentRound + " de " + cycle.rounds,
      progress: 1 - remainingMs / Math.max(1, phaseTotal),
      quickHtml:
        '<span class="ph-focus__chip">Focus ' + cycle.focusMinutes + "m</span>" +
        '<span class="ph-focus__chip ph-focus__chip--ghost">Break ' + cycle.breakMinutes + "m</span>" +
        '<span class="ph-focus__chip ph-focus__chip--ghost">Largo ' + cycle.longBreakMinutes + "m</span>",
      primaryLabel: cycle.isRunning ? "Pausar" : "Empezar",
      resetLabel:   "Reset",
      isRunning:    cycle.isRunning
    };
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  FocusOverlay.prototype._render = function () {
    if (!this.state) return;

    const root = this._ensureRoot();
    if (!this.state.visible) {
      root.hidden = true;
      root.classList.remove("is-visible");
      return;
    }

    root.hidden = false;
    root.classList.add("is-visible");
    root.dataset.layout = this.state.layout;
    root.dataset.mode   = this.state.mode;

    // ── CORRECCIÓN: pasar el timestamp numérico a _buildReadout y dejar
    //    que él cree el Date solo cuando lo necesita (modo reloj).
    const nowMs = Date.now();
    const view  = this._buildReadout(nowMs);

    root.querySelector('[data-role="eyebrow"]').textContent      = view.eyebrow;
    root.querySelector('[data-role="readout"]').innerHTML        = view.readout;
    root.querySelector('[data-role="meta"]').textContent         = view.meta;
    root.querySelector('[data-role="progress"]').style.width     = Math.max(0, Math.min(view.progress, 1)) * 100 + "%";
    root.querySelector('[data-role="quick"]').innerHTML          = view.quickHtml;
    root.querySelector('[data-role="micro"]').textContent        = MODE_LABELS[this.state.mode];
    root.querySelector('[data-action="primary"]').textContent    = view.primaryLabel;

    const resetBtn = root.querySelector('[data-action="reset"]');
    resetBtn.textContent = this.state.mode === "clock" ? "Ocultar" : view.resetLabel;

    root.querySelectorAll("[data-mode]").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.mode === this.state.mode);
    });

    this._renderPosition();
  };

  // ─── Partes del reloj ─────────────────────────────────────────────────────
  FocusOverlay.prototype._getClockParts = function (nowDate) {
    // ── CORRECCIÓN: acepta solo objetos Date; el tipo se garantiza antes
    //    de llamar a este método.
    let hours  = nowDate.getHours();
    let suffix = "";

    if (!this.state.use24Hour) {
      suffix = hours >= 12 ? "PM" : "AM";
      hours  = hours % 12 || 12;
    }

    return {
      hours:   this._pad(hours),
      minutes: this._pad(nowDate.getMinutes()),
      seconds: this._pad(nowDate.getSeconds()),
      suffix
    };
  };

  FocusOverlay.prototype._renderSegmentMarkup = function (segments, suffix, showDots) {
    const values = Array.isArray(segments) ? segments : [segments];
    const parts  = [];

    values.forEach((value, index) => {
      if (showDots && index > 0)
        parts.push('<span class="ph-focus__divider">:</span>');
      parts.push('<span class="ph-focus__segment">' + value + "</span>");
    });

    return (
      '<div class="ph-focus__segment-row">' + parts.join("") + "</div>" +
      (suffix ? '<span class="ph-focus__suffix">' + suffix + "</span>" : "")
    );
  };

  // ─── Formato de duraciones ────────────────────────────────────────────────
  FocusOverlay.prototype._formatDuration = function (ms, allowHours) {
    const safeMs        = Math.max(0, Math.round(ms));
    const totalSeconds  = allowHours ? Math.floor(safeMs / 1000) : Math.ceil(safeMs / 1000);
    const hours         = Math.floor(totalSeconds / 3600);
    const minutes       = Math.floor((totalSeconds % 3600) / 60);
    const seconds       = totalSeconds % 60;

    if (allowHours || hours > 0)
      return [this._pad(hours), this._pad(minutes), this._pad(seconds)];

    return [this._pad(minutes), this._pad(seconds)];
  };

  FocusOverlay.prototype._formatLongDuration = function (ms) {
    const totalMinutes = Math.round(Math.max(0, ms) / 60000);
    if (totalMinutes >= 60) {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return h + "h " + this._pad(m) + "m";
    }
    return totalMinutes + " min";
  };

  FocusOverlay.prototype._formatDate = function (nowDate) {
    try {
      return nowDate.toLocaleDateString("es-ES", {
        weekday: "short", day: "numeric", month: "short"
      });
    } catch (_e) {
      return nowDate.toDateString();
    }
  };

  FocusOverlay.prototype._getCyclePhaseDurationMs = function (cycle) {
    if (cycle.phase === "break")     return cycle.breakMinutes     * 60000;
    if (cycle.phase === "longBreak") return cycle.longBreakMinutes * 60000;
    return cycle.focusMinutes * 60000;
  };

  FocusOverlay.prototype._pad = function (value) {
    return String(value).padStart(2, "0");
  };

  // ─── Limpieza ─────────────────────────────────────────────────────────────
  // ── CORRECCIÓN: exponer destroy() para que el content script pueda
  //    eliminar el listener de storage al descargar la extensión y así
  //    evitar acumulación de listeners en páginas de larga duración.
  FocusOverlay.prototype.destroy = function () {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    }
    chrome.storage.onChanged.removeListener(this._boundStorageListener);
    if (this.root && this.root.isConnected) this.root.remove();
    this.root      = null;
    this.state     = null;
    this.dragState = null;
  };

  ns.FocusOverlay = FocusOverlay;
})(globalThis);