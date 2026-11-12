/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from minibrowser.js */
/* import-globals-from gx-tabs.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-notify.js */
/* import-globals-from gx-shields.js */
/* import-globals-from gx-tools.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

const BLOCKER_PREFS = [
  "privacy.trackingprotection.enabled",
  "privacy.trackingprotection.socialtracking.enabled",
  "privacy.trackingprotection.cryptomining.enabled",
  "privacy.trackingprotection.fingerprinting.enabled",
];

const PROC_NAMES = {
  browser: "Gecko GX (Hauptprozess)",
  gpu: "GPU",
  socket: "Netzwerk",
  rdd: "Medien-Decoder",
  utility: "Hilfsprozess",
  extension: "Erweiterungen",
  privilegedabout: "Interne Seiten",
  file: "Lokale Dateien",
  gmpPlugin: "Medien-Plugin (DRM)",
  inference: "KI-Inferenz",
  forkServer: "Fork-Server",
  preallocated: "Vorgeladen (Reserve)",
};

const Control = {
  history: { cpu: [], ram: [] },
  samples: 60,
  lastCpu: null,
  lastTime: 0,
  lastProcCpu: new Map(),
  procs: [],
  mem: 0,
  cpu: 0,
  slept: 0,
  saveTimer: 0,

  init() {
    this.cores = navigator.hardwareConcurrency || 1;
    this.memsize = Services.sysinfo.getProperty("memsize") || 8 * 1024 ** 3;
    this.totalBlocked = Prefs.get("blockedTotal", 0);

    const ramSlider = $("ram-limit");
    ramSlider.max = Math.floor(this.memsize / 1024 / 1024 / 256) * 256;
    ramSlider.value = Prefs.get("ramLimit", Math.min(4096, +ramSlider.max));
    $("ram-limit-on").checked = Prefs.get("ramLimitOn", false);
    const updateRamLabel = () => {
      $("ram-limit-label").textContent = formatBytes(
        ramSlider.value * 1024 * 1024
      );
    };
    updateRamLabel();
    ramSlider.addEventListener("input", updateRamLabel);
    ramSlider.addEventListener("change", () =>
      Prefs.set("ramLimit", +ramSlider.value)
    );
    $("ram-limit-on").addEventListener("change", e => {
      Prefs.set("ramLimitOn", e.target.checked);
      Sound.play("toggle");
    });

    $("cpu-limit-on").checked = Prefs.get("cpuLimitOn", false);
    $("cpu-limit-on").addEventListener("change", e => {
      Prefs.set("cpuLimitOn", e.target.checked);
      this.applyCpuLimit();
      Sound.play("toggle");
    });
    for (const btn of $("cpu-limit-fps").children) {
      btn.addEventListener("click", () => {
        Prefs.set("cpuFps", +btn.dataset.fps);
        this.applyCpuLimit();
        Sound.play("click");
      });
    }
    this.applyCpuLimit();

    $("blocker-on").checked = Prefs.get("blocker", true);
    $("blocker-on").addEventListener("change", e => {
      Prefs.set("blocker", e.target.checked);
      this.applyBlocker();
      Sound.play("toggle");
    });
    this.applyBlocker();

    $("popups-on").checked = Services.prefs.getBoolPref(
      "dom.disable_open_during_load",
      true
    );
    $("popups-on").addEventListener("change", e => {
      Services.prefs.setBoolPref(
        "dom.disable_open_during_load",
        e.target.checked
      );
      Sound.play("toggle");
    });

    this.tick();
    setInterval(() => this.tick(), 1000);
  },

  show() {
    this.render();
  },

  applyCpuLimit() {
    const on = Prefs.get("cpuLimitOn", false);
    const fps = Prefs.get("cpuFps", 60);
    for (const btn of $("cpu-limit-fps").children) {
      btn.toggleAttribute("selected", +btn.dataset.fps == fps);
    }
    if (on) {
      Services.prefs.setIntPref("layout.frame_rate", fps);
      Services.prefs.setIntPref("dom.min_background_timeout_value", 5000);
    } else {
      Services.prefs.clearUserPref("layout.frame_rate");
      Services.prefs.clearUserPref("dom.min_background_timeout_value");
    }
  },

  applyBlocker() {
    const on = Prefs.get("blocker", true);
    for (const pref of BLOCKER_PREFS) {
      if (on) {
        Services.prefs.setBoolPref(pref, true);
      } else {
        Services.prefs.clearUserPref(pref);
      }
    }
  },

  countBlocked(tab) {
    let log;
    try {
      log = JSON.parse(
        tab.linkedBrowser.browsingContext.currentWindowGlobal.contentBlockingLog
      );
    } catch {
      return;
    }
    let count = 0;
    for (const entries of Object.values(log)) {
      if (
        entries.some(([state, blocked]) => blocked && state & BLOCKED_FLAGS)
      ) {
        count++;
      }
    }
    if (count > tab.blocked) {
      this.totalBlocked += count - tab.blocked;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(
        () => Prefs.set("blockedTotal", this.totalBlocked),
        2000
      );
    }
    tab.blocked = count;
    if (tab == Tabs.selected) {
      Toolbar.update(tab);
      this.renderBlocked();
      Start.updateWidgets();
    }
  },

  async tick() {
    let info;
    try {
      info = await ChromeUtils.requestProcInfo();
    } catch {
      return;
    }
    const now = performance.now();
    const all = [info, ...info.children];
    const mem = all.reduce((sum, p) => sum + p.memory, 0);
    const cpuTime = all.reduce((sum, p) => sum + p.cpuTime, 0);
    const elapsed = now - this.lastTime;
    if (this.lastCpu != null && elapsed > 0) {
      this.cpu = Math.min(
        100,
        (((cpuTime - this.lastCpu) / 1e6 / elapsed) * 100) / this.cores
      );
      this.push("cpu", this.cpu);
    }
    this.lastCpu = cpuTime;

    const procCpu = new Map();
    this.procs = all.map(p => {
      const prev = this.lastProcCpu.get(p.pid);
      procCpu.set(p.pid, p.cpuTime);
      return {
        pid: p.pid,
        type: p.type ?? "browser",
        origin: p.origin ?? "",
        memory: p.memory,
        cpu:
          prev != null && elapsed > 0
            ? (((p.cpuTime - prev) / 1e6 / elapsed) * 100) / this.cores
            : 0,
      };
    });
    this.lastProcCpu = procCpu;
    this.lastTime = now;
    this.mem = mem;
    this.push("ram", mem);

    Tabs.pollAudio();
    if (
      Prefs.get("ramLimitOn", false) &&
      mem > Prefs.get("ramLimit", 4096) * 1024 * 1024
    ) {
      this.enforceRamLimit();
    }

    $("sidebar-ram").firstChild.style.width =
      `${Math.min(100, (mem / this.memsize) * 100 * 4)}%`;
    if (Sidebar.current == "control") {
      this.render();
    }
    if (Tabs.selected?.startPage) {
      Start.updateWidgets();
    }
  },

  push(kind, value) {
    const h = this.history[kind];
    h.push(value);
    if (h.length > this.samples) {
      h.shift();
    }
  },

  enforceRamLimit() {
    const candidate = Tabs.list
      .filter(
        t =>
          t != Tabs.selected &&
          t.linkedBrowser &&
          !t.startPage &&
          !t.hasAttribute("soundplaying") &&
          Date.now() - t.lastActive > 15000
      )
      .sort((a, b) => a.lastActive - b.lastActive)[0];
    if (candidate && Tabs.unload(candidate)) {
      this.slept++;
    }
  },

  render() {
    $("cpu-value").textContent = `${Math.round(this.cpu)} %`;
    $("ram-value").textContent = formatBytes(this.mem);
    this.drawGraph($("cpu-graph"), this.history.cpu, 100);
    this.drawGraph(
      $("ram-graph"),
      this.history.ram,
      Math.max(...this.history.ram) * 1.25
    );
    $("ram-slept").textContent = this.slept
      ? `${this.slept} Tab${this.slept == 1 ? "" : "s"} schlafen gelegt`
      : "";
    this.renderBlocked();
    this.renderProcs();
  },

  renderBlocked() {
    $("blocked-page").textContent = String(Tabs.selected?.blocked ?? 0);
    $("blocked-total").textContent = this.totalBlocked.toLocaleString("de-DE");
  },

  procName(p) {
    if (p.origin) {
      return p.origin.replace(/^https?:\/\//, "").replace(/\^.*$/, "");
    }
    if (p.type.startsWith("web")) {
      return "Webinhalte";
    }
    return PROC_NAMES[p.type] ?? p.type;
  },

  tabsForProc(p) {
    const site = this.procName(p);
    if (!p.origin) {
      return [];
    }
    return Tabs.list.filter(
      t => t.linkedBrowser && hostOf(t.pageUrl).endsWith(site)
    );
  },

  renderProcs() {
    const list = $("proc-list");
    const top = [...this.procs]
      .sort((a, b) => b.memory - a.memory)
      .slice(0, 10);
    list.replaceChildren(
      ...top.map(p => {
        const tabs = this.tabsForProc(p).filter(t => t != Tabs.selected);
        return el(
          "div",
          { class: "proc", title: `PID ${p.pid} · ${p.type}` },
          el("span", { class: "name" }, this.procName(p)),
          el("span", { class: "num" }, `${p.cpu.toFixed(1)} %`),
          el("span", { class: "num" }, formatBytes(p.memory)),
          tabs.length
            ? el("button", {
                class: "icon-btn",
                title: "Zugehörige Tabs schlafen legen",
                icon: "moon",
                onclick: () => {
                  for (const t of tabs) {
                    if (Tabs.unload(t)) {
                      this.slept++;
                    }
                  }
                  Sound.play("toggle");
                },
              })
            : el("span")
        );
      })
    );
  },

  drawGraph(canvas, data, max) {
    const dpr = window.devicePixelRatio;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) {
      return;
    }
    if (canvas.width != w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim() || "#fa1e4e";
    ctx.strokeStyle = style.getPropertyValue("--line").trim() || "#333";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i + 0.5);
      ctx.lineTo(w, (h / 4) * i + 0.5);
      ctx.stroke();
    }
    if (data.length < 2 || !max) {
      return;
    }
    const step = w / (this.samples - 1);
    const x0 = w - (data.length - 1) * step;
    const y = v => h - 2 - (v / max) * (h - 4);
    ctx.beginPath();
    data.forEach((v, i) =>
      i ? ctx.lineTo(x0 + i * step, y(v)) : ctx.moveTo(x0, y(v))
    );
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineTo(w, h);
    ctx.lineTo(x0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(
      0,
      /^#[0-9a-f]{6}$/i.test(accent) ? `${accent}59` : accent
    );
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fill();
  },
};
