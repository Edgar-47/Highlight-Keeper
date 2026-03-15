(function bootstrapFocus(global) {
  "use strict";

  const ns = global.PersistentHighlighter;
  if (!ns || ns.FocusOverlay) return;

  const MODE_LABELS = {
    clock: "Reloj",
    stopwatch: "Cronometro",
    countdown: "Cuenta atras",
    breakCycle: "Ciclos de descanso",
    study: "Pomodoro"
  };

  const PHASE_LABELS = {
    focus: "Enfoque",
    break: "Descanso corto",
    longBreak: "Descanso largo"
  };

  const COUNTDOWN_PRESETS = [5, 15, 25, 50];

  function FocusOverlay(storage) {
    this.storage = storage;
    this.state = null;
    this.root = null;
    this.timerId = 0;
    this.dragState = null;
    this._boundStorageListener = this._handleStorageChange.bind(this);
    chrome.storage.onChanged.addListener(this._boundStorageListener);
  }

  FocusOverlay.prototype.restore = async function restore() {
    this.state = await this.storage.getFocusState();
    const changed = this._reconcileTimers(Date.now());
    if (changed) {
      await this._persist();
    }
    this._render();
    this._ensureTicker();
    return this.state;
  };

  FocusOverlay.prototype.handleAction = async function handleAction(action, payload) {
    if (!this.state) {
      await this.restore();
    }

    const now = Date.now();
    const data = payload || {};

    switch (action) {
      case "SET_VISIBILITY":
        this.state.visible = Boolean(data.visible);
        break;
      case "SET_MODE":
        this._pauseAll(now);
        this.state.mode = this._normalizeMode(data.mode);
        if (this.state.mode === "countdown" && this.state.countdown.remainingMs <= 0) {
          this._resetCountdown();
        }
        if ((this.state.mode === "breakCycle" || this.state.mode === "study") && this.state[this.state.mode].remainingMs <= 0) {
          this._resetCycle(this.state.mode);
        }
        break;
      case "SET_LAYOUT":
        this.state.layout = this._normalizeLayout(data.layout);
        break;
      case "SET_CLOCK_OPTIONS":
        if (data.use24Hour !== undefined) this.state.use24Hour = Boolean(data.use24Hour);
        if (data.showSeconds !== undefined) this.state.showSeconds = Boolean(data.showSeconds);
        break;
      case "CONFIGURE_COUNTDOWN":
        this.state.countdown.durationMinutes = this._clampInt(data.durationMinutes, 1, 600, this.state.countdown.durationMinutes);
        this._resetCountdown();
        break;
      case "CONFIGURE_CYCLE": {
        const modeKey = data.modeKey === "breakCycle" ? "breakCycle" : "study";
        const cycle = this.state[modeKey];
        cycle.focusMinutes = this._clampInt(data.focusMinutes, 1, 600, cycle.focusMinutes);
        cycle.breakMinutes = this._clampInt(data.breakMinutes, 1, 180, cycle.breakMinutes);
        cycle.longBreakMinutes = this._clampInt(data.longBreakMinutes, 1, 240, cycle.longBreakMinutes);
        cycle.rounds = this._clampInt(data.rounds, 1, 12, cycle.rounds);
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

    const changed = this._reconcileTimers(Date.now());
    if (changed) {
      // State already updated in memory; we just persist the normalized result below.
    }

    this.state = ns.normalizeFocusState(this.state);
    await this._persist();
    this._render();
    this._ensureTicker();
    return this.state;
  };

  FocusOverlay.prototype._handleStorageChange = function _handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[ns.FOCUS_STORAGE_KEY]) return;
    this.state = ns.normalizeFocusState(changes[ns.FOCUS_STORAGE_KEY].newValue);
    this._reconcileTimers(Date.now());
    this._render();
    this._ensureTicker();
  };

  FocusOverlay.prototype._persist = function _persist() {
    return this.storage.saveFocusState(this.state, { replace: true });
  };

  FocusOverlay.prototype._ensureRoot = function _ensureRoot() {
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
      '      <button class="ph-focus__hide" type="button" aria-label="Ocultar reloj">x</button>',
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

    const modesHost = root.querySelector('[data-role="modes"]');
    Object.keys(MODE_LABELS).forEach(
      function(mode) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ph-focus__mode";
        button.dataset.mode = mode;
        button.textContent = MODE_LABELS[mode];
        button.addEventListener(
          "click",
          async function() {
            await this.handleAction("SET_MODE", { mode: mode });
          }.bind(this)
        );
        modesHost.appendChild(button);
      }.bind(this)
    );

    root.querySelector(".ph-focus__hide").addEventListener(
      "click",
      function() {
        void this.handleAction("SET_VISIBILITY", { visible: false });
      }.bind(this)
    );

    root.querySelector('[data-action="primary"]').addEventListener(
      "click",
      function() {
        if (!this.state) return;
        if (this.state.mode === "clock") {
          void this.handleAction("SET_LAYOUT", {
            layout: this.state.layout === "stacked" ? "split" : this.state.layout === "split" ? "minimal" : "stacked"
          });
          return;
        }
        void this.handleAction("TOGGLE_RUN");
      }.bind(this)
    );

    root.querySelector('[data-action="center"]').addEventListener(
      "click",
      function() {
        void this.handleAction("CENTER");
      }.bind(this)
    );

    root.querySelector(".ph-focus__drag").addEventListener(
      "pointerdown",
      function(event) {
        this._startDrag(event);
      }.bind(this)
    );

    root.querySelector('[data-role="quick"]').addEventListener(
      "click",
      function(event) {
        const target = event.target.closest("[data-preset-minutes]");
        if (!target) return;
        const minutes = Number(target.getAttribute("data-preset-minutes"));
        if (!Number.isFinite(minutes)) return;
        void this.handleAction("CONFIGURE_COUNTDOWN", { durationMinutes: minutes });
      }.bind(this)
    );

    document.documentElement.appendChild(root);
    this.root = root;
    return root;
  };

  FocusOverlay.prototype._startDrag = function _startDrag(event) {
    if (!this.state) return;

    const root = this._ensureRoot();
    const startX = Number(this.state.x || 24);
    const startY = Number(this.state.y || 24);
    const offsetX = event.clientX - startX;
    const offsetY = event.clientY - startY;

    this.dragState = {
      pointerId: event.pointerId,
      offsetX: offsetX,
      offsetY: offsetY
    };

    root.classList.add("is-dragging");
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const move = function(moveEvent) {
      if (!this.dragState || moveEvent.pointerId !== this.dragState.pointerId) return;
      this._setPosition(moveEvent.clientX - this.dragState.offsetX, moveEvent.clientY - this.dragState.offsetY);
      this._renderPosition();
    }.bind(this);

    const finish = async function(upEvent) {
      if (!this.dragState || upEvent.pointerId !== this.dragState.pointerId) return;
      event.currentTarget.removeEventListener("pointermove", move);
      event.currentTarget.removeEventListener("pointerup", finish);
      event.currentTarget.removeEventListener("pointercancel", finish);
      root.classList.remove("is-dragging");
      this.dragState = null;
      this._renderPosition();
      await this._persist();
    }.bind(this);

    event.currentTarget.addEventListener("pointermove", move);
    event.currentTarget.addEventListener("pointerup", finish);
    event.currentTarget.addEventListener("pointercancel", finish);
  };

  FocusOverlay.prototype._ensureTicker = function _ensureTicker() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    }

    if (!this.state) return;

    const shouldTick =
      this.state.visible ||
      this.state.stopwatch.isRunning ||
      this.state.countdown.isRunning ||
      this.state.breakCycle.isRunning ||
      this.state.study.isRunning;

    if (!shouldTick) return;

    this.timerId = window.setInterval(
      function() {
        if (!this.state) return;
        const changed = this._reconcileTimers(Date.now());
        if (changed) {
          void this._persist();
        }
        this._render();
      }.bind(this),
      250
    );
  };

  FocusOverlay.prototype._reconcileTimers = function _reconcileTimers(now) {
    if (!this.state) return false;

    let changed = false;

    if (this.state.countdown.isRunning && this.state.countdown.endsAt) {
      const remaining = this.state.countdown.endsAt - now;
      if (remaining <= 0) {
        this.state.countdown.remainingMs = 0;
        this.state.countdown.endsAt = null;
        this.state.countdown.isRunning = false;
        changed = true;
      }
    }

    changed = this._reconcileCycle("breakCycle", now) || changed;
    changed = this._reconcileCycle("study", now) || changed;

    return changed;
  };

  FocusOverlay.prototype._reconcileCycle = function _reconcileCycle(modeKey, now) {
    const cycle = this.state[modeKey];
    if (!cycle || !cycle.isRunning || !cycle.endsAt) return false;

    let changed = false;

    while (cycle.isRunning && cycle.endsAt && now >= cycle.endsAt) {
      changed = true;

      if (cycle.phase === "focus") {
        if (cycle.currentRound >= cycle.rounds) {
          cycle.phase = "longBreak";
          cycle.remainingMs = cycle.longBreakMinutes * 60 * 1000;
          cycle.endsAt = cycle.endsAt + cycle.remainingMs;
          continue;
        }

        cycle.phase = "break";
        cycle.remainingMs = cycle.breakMinutes * 60 * 1000;
        cycle.endsAt = cycle.endsAt + cycle.remainingMs;
        continue;
      }

      if (cycle.phase === "break") {
        cycle.currentRound = Math.min(cycle.currentRound + 1, cycle.rounds);
        cycle.phase = "focus";
        cycle.remainingMs = cycle.focusMinutes * 60 * 1000;
        cycle.endsAt = cycle.endsAt + cycle.remainingMs;
        continue;
      }

      cycle.phase = "focus";
      cycle.currentRound = 1;
      cycle.remainingMs = cycle.focusMinutes * 60 * 1000;
      cycle.endsAt = null;
      cycle.isRunning = false;
    }

    return changed;
  };

  FocusOverlay.prototype._toggleRun = function _toggleRun(now) {
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
          this.state.countdown.endsAt = null;
          this.state.countdown.isRunning = false;
        } else {
          if (this.state.countdown.remainingMs <= 0) this._resetCountdown();
          this._pauseAll(now, "countdown");
          this.state.countdown.endsAt = now + this.state.countdown.remainingMs;
          this.state.countdown.isRunning = true;
        }
        break;
      case "breakCycle":
      case "study": {
        const cycle = this.state[this.state.mode];
        if (cycle.isRunning) {
          cycle.remainingMs = this._getCycleRemaining(this.state.mode, now);
          cycle.endsAt = null;
          cycle.isRunning = false;
        } else {
          if (cycle.remainingMs <= 0) this._resetCycle(this.state.mode);
          this._pauseAll(now, this.state.mode);
          cycle.endsAt = now + cycle.remainingMs;
          cycle.isRunning = true;
        }
        break;
      }
      default:
        this.state.visible = true;
        break;
    }
  };

  FocusOverlay.prototype._pauseAll = function _pauseAll(now, exceptMode) {
    if (exceptMode !== "stopwatch" && this.state.stopwatch.isRunning) {
      this.state.stopwatch.elapsedMs = this._getStopwatchElapsed(now);
      this.state.stopwatch.startedAt = null;
      this.state.stopwatch.isRunning = false;
    }

    if (exceptMode !== "countdown" && this.state.countdown.isRunning) {
      this.state.countdown.remainingMs = this._getCountdownRemaining(now);
      this.state.countdown.endsAt = null;
      this.state.countdown.isRunning = false;
    }

    ["breakCycle", "study"].forEach(
      function(modeKey) {
        if (exceptMode === modeKey) return;
        const cycle = this.state[modeKey];
        if (!cycle.isRunning) return;
        cycle.remainingMs = this._getCycleRemaining(modeKey, now);
        cycle.endsAt = null;
        cycle.isRunning = false;
      }.bind(this)
    );
  };

  FocusOverlay.prototype._resetCurrentMode = function _resetCurrentMode() {
    if (this.state.mode === "countdown") {
      this._resetCountdown();
      return;
    }
    if (this.state.mode === "stopwatch") {
      this.state.stopwatch.elapsedMs = 0;
      this.state.stopwatch.startedAt = null;
      this.state.stopwatch.isRunning = false;
      return;
    }
    if (this.state.mode === "breakCycle" || this.state.mode === "study") {
      this._resetCycle(this.state.mode);
    }
  };

  FocusOverlay.prototype._resetCountdown = function _resetCountdown() {
    this.state.countdown.remainingMs = this.state.countdown.durationMinutes * 60 * 1000;
    this.state.countdown.endsAt = null;
    this.state.countdown.isRunning = false;
  };

  FocusOverlay.prototype._resetCycle = function _resetCycle(modeKey) {
    const cycle = this.state[modeKey];
    cycle.currentRound = 1;
    cycle.phase = "focus";
    cycle.remainingMs = cycle.focusMinutes * 60 * 1000;
    cycle.endsAt = null;
    cycle.isRunning = false;
  };

  FocusOverlay.prototype._normalizeMode = function _normalizeMode(mode) {
    return ["clock", "stopwatch", "countdown", "breakCycle", "study"].includes(String(mode || "")) ? String(mode) : "clock";
  };

  FocusOverlay.prototype._normalizeLayout = function _normalizeLayout(layout) {
    return ["stacked", "split", "minimal"].includes(String(layout || "")) ? String(layout) : "stacked";
  };

  FocusOverlay.prototype._clampInt = function _clampInt(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(Math.max(Math.round(numeric), min), max);
  };

  FocusOverlay.prototype._getStopwatchElapsed = function _getStopwatchElapsed(now) {
    const state = this.state.stopwatch;
    if (!state.isRunning || !state.startedAt) return state.elapsedMs;
    return Math.max(0, state.elapsedMs + (now - state.startedAt));
  };

  FocusOverlay.prototype._getCountdownRemaining = function _getCountdownRemaining(now) {
    const state = this.state.countdown;
    if (!state.isRunning || !state.endsAt) return state.remainingMs;
    return Math.max(0, state.endsAt - now);
  };

  FocusOverlay.prototype._getCycleRemaining = function _getCycleRemaining(modeKey, now) {
    const cycle = this.state[modeKey];
    if (!cycle.isRunning || !cycle.endsAt) return cycle.remainingMs;
    return Math.max(0, cycle.endsAt - now);
  };

  FocusOverlay.prototype._centerPosition = function _centerPosition() {
    const root = this._ensureRoot();
    root.hidden = false;
    const width = Math.max(root.offsetWidth, 320);
    const x = Math.round(Math.max(12, (window.innerWidth - width) / 2));
    this.state.x = x;
    this.state.y = 24;
  };

  FocusOverlay.prototype._setPosition = function _setPosition(x, y) {
    const root = this._ensureRoot();
    const width = Math.max(root.offsetWidth, 320);
    const height = Math.max(root.offsetHeight, 260);
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);
    this.state.x = this._clampInt(x, 12, maxX, this.state.x || 24);
    this.state.y = this._clampInt(y, 12, maxY, this.state.y || 24);
  };

  FocusOverlay.prototype._renderPosition = function _renderPosition() {
    if (!this.root || !this.state) return;
    this.root.style.left = this.state.x + "px";
    this.root.style.top = this.state.y + "px";
  };

  FocusOverlay.prototype._buildReadout = function _buildReadout(now) {
    if (this.state.mode === "clock") {
      const parts = this._getClockParts(now);
      const segments = [parts.hours, parts.minutes];
      if (this.state.showSeconds) segments.push(parts.seconds);
      return {
        eyebrow: "Hora local",
        readout: this._renderSegmentMarkup(segments, parts.suffix, true),
        meta: this._formatDate(now),
        progress: (now.getSeconds() + now.getMilliseconds() / 1000) / 60,
        quickHtml: '<span class="ph-focus__chip ph-focus__chip--ghost">' + (this.state.use24Hour ? "24h" : "12h") + '</span>' +
          '<span class="ph-focus__chip ph-focus__chip--ghost">' + (this.state.showSeconds ? "Con segundos" : "Sin segundos") + '</span>' +
          '<span class="ph-focus__chip ph-focus__chip--ghost">' + MODE_LABELS[this.state.mode] + "</span>",
        primaryLabel: "Cambiar formato",
        resetLabel: "Reset",
        isRunning: false
      };
    }

    if (this.state.mode === "stopwatch") {
      const elapsed = this._getStopwatchElapsed(now);
      return {
        eyebrow: "Cronometro libre",
        readout: this._renderSegmentMarkup(this._formatDuration(elapsed, true), "", false),
        meta: this.state.stopwatch.isRunning ? "Midiendo en tiempo real" : "Listo para arrancar",
        progress: Math.min((elapsed % (60 * 60 * 1000)) / (60 * 60 * 1000), 1),
        quickHtml: '<span class="ph-focus__chip">Tiempo total</span><span class="ph-focus__chip ph-focus__chip--ghost">' + this._formatLongDuration(elapsed) + "</span>",
        primaryLabel: this.state.stopwatch.isRunning ? "Pausar" : "Empezar",
        resetLabel: "Reset",
        isRunning: this.state.stopwatch.isRunning
      };
    }

    if (this.state.mode === "countdown") {
      const remaining = this._getCountdownRemaining(now);
      const total = Math.max(1, this.state.countdown.durationMinutes * 60 * 1000);
      return {
        eyebrow: "Cuenta atras",
        readout: this._renderSegmentMarkup(this._formatDuration(remaining, false), "", false),
        meta: this.state.countdown.isRunning
          ? "Quedan " + this._formatLongDuration(remaining)
          : this.state.countdown.durationMinutes + " minutos configurados",
        progress: 1 - remaining / total,
        quickHtml: COUNTDOWN_PRESETS.map(
          function(minutes) {
            return '<button class="ph-focus__chip ph-focus__chip--interactive' + (minutes === this.state.countdown.durationMinutes ? " is-active" : "") +
              '" type="button" data-preset-minutes="' + minutes + '">' + minutes + "m</button>";
          }.bind(this)
        ).join(""),
        primaryLabel: this.state.countdown.isRunning ? "Pausar" : "Empezar",
        resetLabel: "Reset",
        isRunning: this.state.countdown.isRunning
      };
    }

    const cycle = this.state[this.state.mode];
    const remainingCycle = this._getCycleRemaining(this.state.mode, now);
    const phaseTotal = this._getCyclePhaseDurationMs(cycle);
    return {
      eyebrow: MODE_LABELS[this.state.mode],
      readout: this._renderSegmentMarkup(this._formatDuration(remainingCycle, false), "", false),
      meta: PHASE_LABELS[cycle.phase] + " · ronda " + cycle.currentRound + " de " + cycle.rounds,
      progress: 1 - remainingCycle / Math.max(1, phaseTotal),
      quickHtml:
        '<span class="ph-focus__chip">Focus ' + cycle.focusMinutes + "m</span>" +
        '<span class="ph-focus__chip ph-focus__chip--ghost">Break ' + cycle.breakMinutes + "m</span>" +
        '<span class="ph-focus__chip ph-focus__chip--ghost">Largo ' + cycle.longBreakMinutes + "m</span>",
      primaryLabel: cycle.isRunning ? "Pausar" : "Empezar",
      resetLabel: "Reset",
      isRunning: cycle.isRunning
    };
  };

  FocusOverlay.prototype._render = function _render() {
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
    root.dataset.mode = this.state.mode;

    const now = new Date();
    const view = this._buildReadout(now);

    root.querySelector('[data-role="eyebrow"]').textContent = view.eyebrow;
    root.querySelector('[data-role="readout"]').innerHTML = view.readout;
    root.querySelector('[data-role="meta"]').textContent = view.meta;
    root.querySelector('[data-role="progress"]').style.width = Math.max(0, Math.min(view.progress, 1)) * 100 + "%";
    root.querySelector('[data-role="quick"]').innerHTML = view.quickHtml;
    root.querySelector('[data-role="micro"]').textContent = MODE_LABELS[this.state.mode];

    root.querySelector('[data-action="primary"]').textContent = view.primaryLabel;
    root.querySelector('[data-action="reset"]').textContent = this.state.mode === "clock" ? "Ocultar" : view.resetLabel;
    root.querySelector('[data-action="reset"]').onclick = this.state.mode === "clock"
      ? function() {
          void this.handleAction("SET_VISIBILITY", { visible: false });
        }.bind(this)
      : function() {
          void this.handleAction("RESET_MODE");
        }.bind(this);

    root.querySelectorAll("[data-mode]").forEach(
      function(button) {
        button.classList.toggle("is-active", button.dataset.mode === this.state.mode);
      }.bind(this)
    );

    this._renderPosition();
  };

  FocusOverlay.prototype._getClockParts = function _getClockParts(now) {
    const date = now instanceof Date ? now : new Date();
    let hours = date.getHours();
    let suffix = "";

    if (!this.state.use24Hour) {
      suffix = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
    }

    return {
      hours: this._pad(hours),
      minutes: this._pad(date.getMinutes()),
      seconds: this._pad(date.getSeconds()),
      suffix: suffix
    };
  };

  FocusOverlay.prototype._renderSegmentMarkup = function _renderSegmentMarkup(segments, suffix, showDots) {
    const values = Array.isArray(segments) ? segments : [segments];
    const parts = [];

    values.forEach(function(value, index) {
      if (showDots && index > 0) {
        parts.push('<span class="ph-focus__divider">:</span>');
      }

      parts.push('<span class="ph-focus__segment">' + value + "</span>");
    });

    return '<div class="ph-focus__segment-row">' + parts.join("") + "</div>" +
      (suffix ? '<span class="ph-focus__suffix">' + suffix + "</span>" : "");
  };

  FocusOverlay.prototype._formatDuration = function _formatDuration(ms, allowHours) {
    const safeMs = Math.max(0, Math.round(ms));
    const totalSeconds = allowHours ? Math.floor(safeMs / 1000) : Math.ceil(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (allowHours || hours > 0) {
      return [this._pad(hours), this._pad(minutes), this._pad(seconds)];
    }

    return [this._pad(minutes), this._pad(seconds)];
  };

  FocusOverlay.prototype._formatLongDuration = function _formatLongDuration(ms) {
    const safeMs = Math.max(0, Math.round(ms));
    const totalMinutes = Math.round(safeMs / 60000);
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours + "h " + this._pad(minutes) + "m";
    }
    return totalMinutes + " min";
  };

  FocusOverlay.prototype._formatDate = function _formatDate(now) {
    try {
      return now.toLocaleDateString("es-ES", {
        weekday: "short",
        day: "numeric",
        month: "short"
      });
    } catch (_error) {
      return now.toDateString();
    }
  };

  FocusOverlay.prototype._getCyclePhaseDurationMs = function _getCyclePhaseDurationMs(cycle) {
    if (cycle.phase === "break") return cycle.breakMinutes * 60 * 1000;
    if (cycle.phase === "longBreak") return cycle.longBreakMinutes * 60 * 1000;
    return cycle.focusMinutes * 60 * 1000;
  };

  FocusOverlay.prototype._pad = function _pad(value) {
    return String(value).padStart(2, "0");
  };

  ns.FocusOverlay = FocusOverlay;
})(globalThis);
