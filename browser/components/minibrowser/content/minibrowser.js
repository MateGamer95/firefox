/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from gx-tabs.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-notify.js */
/* import-globals-from gx-shields.js */
/* import-globals-from gx-tools.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

const Modules = {};
ChromeUtils.defineESModuleGetters(Modules, {
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  GXShields:
    "moz-src:///browser/components/minibrowser/modules/GXShields.sys.mjs",
  GXStartup:
    "moz-src:///browser/components/minibrowser/modules/GXShields.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  QR: "moz-src:///toolkit/components/qrcode/encoder.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

const $ = id => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const SYSTEM_PRINCIPAL = Services.scriptSecurityManager.getSystemPrincipal();

const Prefs = {
  get(name, fallback) {
    try {
      return JSON.parse(Services.prefs.getStringPref(`geckogx.${name}`));
    } catch {
      return fallback;
    }
  },
  set(name, value) {
    Services.prefs.setStringPref(`geckogx.${name}`, JSON.stringify(value));
  },
};

const ICONS = {
  back: "M15 18l-6-6 6-6",
  forward: "M9 18l6-6-6-6",
  reload: "M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7",
  stop: "M6 6l12 12 M18 6L6 18",
  close: "M7 7l10 10 M17 7L7 17",
  home: "M3 11l9-8 9 8 M5 9.5V21h5v-6h4v6h5V9.5",
  plus: "M12 5v14 M5 12h14",
  star: "M12 3l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.6l-5.7 3 1.1-6.4L2.8 9.7l6.4-.9z",
  lock: "M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
  shield: "M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z M9 12l2 2 4-4",
  download: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5 M3.5 3.5v5h5 M12 7.5V12l3 2",
  bookmark: "M6.5 3h11v18L12 17l-5.5 4z",
  gauge: "M4.2 18A9 9 0 1 1 19.8 18 M12 13l4-5 M12 13h.01",
  sliders:
    "M4 6h9 M17 6h3 M15 4v4 M4 12h3 M11 12h9 M9 10v4 M4 18h11 M19 18h1 M17 16v4",
  speaker:
    "M4 9.5h3.5L13 5v14l-5.5-4.5H4z M16.5 9a4.5 4.5 0 0 1 0 6 M19 6.5a8 8 0 0 1 0 11",
  muted: "M4 9.5h3.5L13 5v14l-5.5-4.5H4z M16.5 9.5l5 5 M21.5 9.5l-5 5",
  dots: "M12 5.5h.01 M12 12h.01 M12 18.5h.01",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M20 20l-4.8-4.8",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  folder: "M3 6.5h6l2 2h10V19H3z",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  play: "M8 5l11 7-11 7z",
  retry: "M4 12a8 8 0 1 0 2.3-5.7 M4 4v5h5",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  key: "M15 9a4 4 0 1 0-3.9 4.9L10 15H8v2H6v2H3v-3l6.1-6.1A4 4 0 0 0 15 9z M16 8h.01",
  qr: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M18 14h2 M14 18v2",
  book: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z M4 19V5 M8 7h6",
  translate:
    "M4 5h9 M8.5 3v2 M6 5c1 4 3.5 6.5 6 8 M11 5c-1 4-4 7.5-7 9 M13 21l4-9 4 9 M14.5 18h5",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  tabs: "M3 6h18v14H3z M3 10h18 M8 6V3h8v3",
  incognito:
    "M3 11h18 M6 11l2-6h8l2 6 M8 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M11 16h2",
};

function makeIcon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}

function setIcon(node, name) {
  node.querySelector(":scope > svg.icon")?.remove();
  node.prepend(makeIcon(name));
}

function applyIcons(root = document) {
  for (const node of root.querySelectorAll("[data-icon]")) {
    setIcon(node, node.dataset.icon);
  }
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key == "class") {
      node.className = value;
    } else if (key == "icon") {
      node.append(makeIcon(value));
    } else if (key.startsWith("on")) {
      node.addEventListener(key.slice(2), value);
    } else if (key in node && typeof value != "string") {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  node.append(...children.filter(c => c != null));
  return node;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function escapeLike(text) {
  return text.replace(/[/%_]/g, "/$&");
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/**
 * Builds an <img> for a site icon that falls back through the given sources
 * and finally to a letter badge.
 *
 * @param {string} url
 * @param {string[]|null} sources  Icon URLs to try in order.
 * @param {string} letterClass  Class for the letter fallback.
 * @returns {Element}
 */
function siteIcon(url, sources, letterClass = "letter") {
  const host = hostOf(url);
  const candidates = sources ?? [
    `page-icon:${url}`,
    `https://${host}/favicon.ico`,
  ];
  const letter = el(
    "span",
    { class: letterClass },
    (host.replace(/^www\./, "")[0] || "?").toUpperCase()
  );
  const img = el("img", { alt: "" });
  let i = 0;
  img.addEventListener("error", () => {
    if (++i < candidates.length) {
      img.src = candidates[i];
    } else {
      img.replaceWith(letter);
    }
  });
  if (!host) {
    return letter;
  }
  img.src = candidates[0];
  return img;
}

function copyToClipboard(text) {
  Cc["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Ci.nsIClipboardHelper)
    .copyString(text);
}

const Sound = {
  ctx: null,
  suspended: false,
  play(kind) {
    if (this.suspended || !Prefs.get("sounds", true)) {
      return;
    }
    const [from, to, duration] = {
      open: [520, 980, 0.09],
      close: [760, 280, 0.09],
      click: [1100, 1100, 0.025],
      toggle: [420, 720, 0.07],
    }[kind] ?? [600, 600, 0.04];
    try {
      this.ctx ??= new AudioContext();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + duration);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch {}
  },
};

const Search = {
  ready: Modules.SearchService.init().catch(console.error),
  get name() {
    try {
      return Modules.SearchService.defaultEngine?.name ?? "Suchmaschine";
    } catch {
      return "Suchmaschine";
    }
  },
  async url(query) {
    await this.ready;
    const engine = await Modules.SearchService.getDefault();
    return engine.getSubmission(query).uri.spec;
  },
};

const Menu = {
  clean(items) {
    const out = [];
    for (const item of items) {
      if (item == "-" && (!out.length || out.at(-1) == "-")) {
        continue;
      }
      out.push(item);
    }
    while (out.at(-1) == "-") {
      out.pop();
    }
    return out;
  },
  fill(popup, items) {
    popup.replaceChildren();
    for (const item of this.clean(items)) {
      if (item == "-") {
        popup.append(document.createXULElement("menuseparator"));
        continue;
      }
      const mi = document.createXULElement("menuitem");
      mi.setAttribute("label", item.label);
      if (item.accel) {
        mi.setAttribute("acceltext", item.accel);
      }
      if (item.disabled) {
        mi.setAttribute("disabled", "true");
      }
      mi.addEventListener("command", () => {
        Sound.play("click");
        item.cmd();
      });
      popup.append(mi);
    }
  },
  showAt(popup, items, event) {
    this.fill(popup, items);
    popup.openPopupAtScreen(event.screenX, event.screenY, true);
  },
  showFor(popup, items, anchor) {
    this.fill(popup, items);
    popup.openPopup(anchor, "after_end");
  },
};

const Urlbar = {
  results: [],
  index: -1,
  timer: 0,
  generation: 0,

  init() {
    this.input = $("urlbar");
    this.box = $("urlbar-results");
    this.input.addEventListener("input", () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(), 60);
    });
    this.input.addEventListener("focus", () => this.input.select());
    this.input.addEventListener("blur", () =>
      setTimeout(() => this.hide(), 150)
    );
    this.input.addEventListener("keydown", e => this.onKeyDown(e));
  },

  focus() {
    this.input.focus();
    this.input.select();
  },

  onKeyDown(e) {
    if (e.key == "ArrowDown" || e.key == "ArrowUp") {
      if (!this.results.length) {
        return;
      }
      e.preventDefault();
      const n = this.results.length;
      let i = this.index + (e.key == "ArrowDown" ? 1 : -1);
      if (i >= n) {
        i = -1;
      } else if (i < -1) {
        i = n - 1;
      }
      this.index = i;
      this.input.value =
        i >= 0 && this.results[i].url && !this.results[i].search
          ? this.results[i].url
          : this.typed;
      this.render();
    } else if (e.key == "Enter") {
      e.preventDefault();
      const picked = this.results[this.index];
      if (picked?.answer) {
        this.copyAnswer(picked.answer);
        return;
      }
      const target = picked ? picked.url : this.input.value.trim();
      this.hide();
      if (!target) {
        return;
      }
      if (e.altKey || e.ctrlKey) {
        Tabs.open(target);
      } else {
        Tabs.load(Tabs.selected, target);
      }
    } else if (e.key == "Escape") {
      if (!this.box.hidden) {
        this.hide();
      } else {
        Toolbar.update(Tabs.selected);
        Tabs.selected?.linkedBrowser?.focus();
      }
    }
  },

  async update() {
    this.typed = this.input.value;
    const text = this.typed.trim();
    const gen = ++this.generation;
    if (!text) {
      this.hide();
      return;
    }
    let rows = [];
    try {
      const db = await Modules.PlacesUtils.promiseDBConnection();
      const like = `%${escapeLike(text)}%`;
      rows = await db.executeCached(
        `SELECT url, title FROM moz_places
         WHERE hidden = 0 AND (url LIKE :pattern ESCAPE '/' OR title LIKE :pattern ESCAPE '/')
         ORDER BY frecency DESC LIMIT 7`,
        { pattern: like }
      );
    } catch (e) {
      console.error(e);
    }
    if (gen != this.generation) {
      return;
    }
    const calc = Calc.evaluate(text);
    const unit = calc == null ? Units.convert(text) : null;
    const answer = calc != null ? Calc.format(calc) : unit;
    this.results = [
      ...(answer ? [{ answer, title: text }] : []),
      { url: await Search.url(text), title: text, search: true },
      ...rows.map(r => ({
        url: r.getResultByName("url"),
        title: r.getResultByName("title") || r.getResultByName("url"),
      })),
    ];
    this.index = -1;
    this.render();
  },

  render() {
    const rect = $("urlbar-wrap").getBoundingClientRect();
    Object.assign(this.box.style, {
      left: `${rect.left}px`,
      top: `${rect.bottom + 4}px`,
      width: `${rect.width}px`,
    });
    this.box.replaceChildren(
      ...this.results.map((r, i) => {
        const row = el(
          "div",
          {
            class: "item",
            onmousedown: e => {
              e.preventDefault();
              if (r.answer) {
                this.copyAnswer(r.answer);
                return;
              }
              this.hide();
              if (e.button == 1) {
                Tabs.open(r.url);
              } else {
                Tabs.load(Tabs.selected, r.url);
              }
            },
          },
          this.rowIcon(r),
          el(
            "span",
            { class: "text" },
            el("b", {}, this.rowTitle(r)),
            el("span", { class: "sub" }, this.rowSub(r))
          )
        );
        row.classList.toggle("answer", !!r.answer);
        row.toggleAttribute("selected", i == this.index);
        return row;
      })
    );
    this.box.hidden = false;
  },

  rowIcon(r) {
    if (r.answer) {
      return makeIcon("sliders");
    }
    return r.search ? makeIcon("search") : siteIcon(r.url, null, "fallback");
  },

  rowTitle(r) {
    if (r.answer) {
      return `= ${r.answer}`;
    }
    return r.search ? `„${r.title}“` : r.title;
  },

  rowSub(r) {
    if (r.answer) {
      return "– Enter kopiert das Ergebnis";
    }
    return r.search ? `– mit ${Search.name} suchen` : r.url;
  },

  copyAnswer(answer) {
    copyToClipboard(
      answer.replace(/\s.*$/, "").replace(/\./g, "").replace(",", ".")
    );
    this.hide();
    Toast.show(`${answer} kopiert`);
  },

  hide() {
    this.box.hidden = true;
    this.results = [];
    this.index = -1;
  },
};

const Toolbar = {
  init() {
    $("back").addEventListener("click", () => Tabs.goBack());
    $("forward").addEventListener("click", () =>
      Tabs.selected.linkedBrowser?.goForward()
    );
    $("reload").addEventListener("click", e => {
      const b = Tabs.selected.linkedBrowser;
      if (Tabs.selected.hasAttribute("busy")) {
        b?.stop();
      } else if (e.shiftKey) {
        b?.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE);
      } else {
        b?.reload();
      }
    });
    $("home").addEventListener("click", () => Tabs.goHome(Tabs.selected));
    $("star").addEventListener("click", () => Bookmarks.toggle(Tabs.selected));
    $("zoom").addEventListener("click", () => Zoom.change(0));
    $("qr-btn").addEventListener("click", () => Tools.toggleQR());
    $("reading-btn").addEventListener("click", () => ReadingList.addCurrent());
    $("reading-add").addEventListener("click", () => ReadingList.addCurrent());
    document.addEventListener("mousedown", e => {
      const qr = $("qr-popup");
      if (
        !qr.hidden &&
        !qr.contains(e.target) &&
        !$("qr-btn").contains(e.target)
      ) {
        qr.hidden = true;
      }
    });
    $("menu-btn").addEventListener("click", () => MainMenu.open($("menu-btn")));
  },

  update(tab) {
    if (!tab) {
      return;
    }
    const b = tab.linkedBrowser;
    const start = tab.startPage;
    $("back").disabled = !(b && (b.canGoBack || start));
    $("forward").disabled = !b?.canGoForward || start;
    const busy = tab.hasAttribute("busy");
    $("reload").toggleAttribute("busy", busy);
    setIcon($("reload"), busy ? "stop" : "reload");
    if (document.activeElement != Urlbar.input) {
      Urlbar.input.value =
        start || !tab.pageUrl || tab.pageUrl == "about:blank"
          ? ""
          : tab.pageUrl;
    }
    let state = "other";
    if (start) {
      state = "start";
    } else if (tab.pageUrl?.startsWith("https:") && tab.secure) {
      state = "secure";
    } else if (tab.pageUrl?.startsWith("http:")) {
      state = "insecure";
    }
    $("identity").dataset.state = state;
    setIcon(
      $("identity"),
      { start: "search", insecure: "shield" }[state] ?? "lock"
    );
    const zoom = b?.fullZoom ?? 1;
    $("zoom").hidden = Math.abs(zoom - 1) < 0.01 || start;
    $("zoom").textContent = `${Math.round(zoom * 100)} %`;
    $("qr-btn").hidden = start || !/^https?:/.test(tab.pageUrl ?? "");
    $("reading-btn").hidden = $("qr-btn").hidden;
    this.updateShield(tab);
    Bookmarks.updateStar(start ? "" : tab.pageUrl);
  },

  updateShield(tab) {
    const on = Shields.isOn(tab);
    const count = Shields.count(tab);
    $("shield").toggleAttribute("off", !on);
    $("shield-count").textContent =
      on && count && !tab.startPage ? String(count) : "";
  },
};

const Zoom = {
  steps: [0.3, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.2, 1.33, 1.5, 1.7, 2, 2.4, 3],
  change(dir) {
    const tab = Tabs.selected;
    const b = tab?.linkedBrowser;
    if (!b) {
      return;
    }
    if (dir == 0) {
      b.fullZoom = 1;
    } else {
      const z = b.fullZoom;
      const next =
        dir > 0
          ? this.steps.find(s => s > z + 0.01)
          : this.steps.findLast(s => s < z - 0.01);
      if (next) {
        b.fullZoom = next;
      }
    }
    Toolbar.update(tab);
  },
};

const FindBar = {
  attached: null,

  init() {
    this.bar = $("findbar");
    this.input = $("find-input");
    this.input.addEventListener("input", () => this.find());
    this.input.addEventListener("keydown", e => {
      if (e.key == "Enter") {
        this.next(e.shiftKey);
      } else if (e.key == "Escape") {
        this.close();
      }
    });
    $("find-next").addEventListener("click", () => this.next(false));
    $("find-prev").addEventListener("click", () => this.next(true));
    $("find-close").addEventListener("click", () => this.close());
    $("find-highlight").addEventListener("change", () => this.find());
  },

  get finder() {
    return Tabs.selected?.startPage
      ? null
      : Tabs.selected?.linkedBrowser?.finder;
  },

  open() {
    const finder = this.finder;
    if (!finder) {
      return;
    }
    if (this.attached != finder) {
      this.attached?.removeResultListener(this);
      finder.addResultListener(this);
      this.attached = finder;
    }
    this.bar.hidden = false;
    this.input.focus();
    this.input.select();
    if (this.input.value) {
      this.find();
    }
  },

  find() {
    const text = this.input.value;
    const finder = this.attached;
    if (!finder) {
      return;
    }
    if (!text) {
      this.input.removeAttribute("notfound");
      $("find-count").textContent = "";
      finder.highlight(false, "", false);
      return;
    }
    finder.fastFind(text, false, false);
    finder.highlight($("find-highlight").checked, text, false);
    finder.requestMatchesCount(text, { linksOnly: false });
  },

  next(backwards) {
    if (this.bar.hidden) {
      this.open();
      return;
    }
    const text = this.input.value;
    if (text && this.attached) {
      this.attached.findAgain(text, backwards, false, false);
      this.attached.requestMatchesCount(text, { linksOnly: false });
    }
  },

  close() {
    if (this.bar.hidden) {
      return;
    }
    this.bar.hidden = true;
    const finder = this.attached;
    if (finder) {
      try {
        finder.highlight(false, "", false);
        finder.removeSelection();
        finder.focusContent();
      } catch {}
      finder.removeResultListener(this);
    }
    this.attached = null;
  },

  onFindResult(data) {
    this.input.toggleAttribute(
      "notfound",
      data.result == Ci.nsITypeAheadFind.FIND_NOTFOUND
    );
  },
  onMatchesCountResult(result) {
    $("find-count").textContent = result.total
      ? `${result.current} von ${result.total}`
      : "Keine Treffer";
  },
  onHighlightFinished() {},
  onCurrentSelection() {},
};

const MainMenu = {
  open(anchor) {
    const tab = Tabs.selected;
    const page = !!tab?.pageUrl && !tab.startPage;
    Menu.showFor(
      $("mainMenu"),
      [
        { label: "Neuer Tab", accel: "Strg+T", cmd: () => Tabs.open() },
        { label: "Neues Fenster", accel: "Strg+N", cmd: () => openNewWindow() },
        {
          label: "Neues privates Fenster",
          accel: "Strg+Umschalt+N",
          cmd: () => openNewWindow({ private: true }),
        },
        {
          label: "Geschlossenen Tab wiederherstellen",
          accel: "Strg+Umschalt+T",
          disabled: !Tabs.closed.length,
          cmd: () => Tabs.reopenClosed(),
        },
        {
          label: "Tabs suchen …",
          accel: "Strg+Umschalt+A",
          cmd: () => TabSearch.toggle(),
        },
        "-",
        {
          label: "Verlauf",
          accel: "Strg+H",
          cmd: () => Sidebar.show("history"),
        },
        { label: "Lesezeichen", cmd: () => Sidebar.show("bookmarks") },
        { label: "Leseliste", cmd: () => Sidebar.show("reading") },
        { label: "Passwörter", cmd: () => Sidebar.show("passwords") },
        {
          label: "Downloads",
          accel: "Strg+J",
          cmd: () => Sidebar.show("downloads"),
        },
        "-",
        {
          label: "Seite übersetzen",
          disabled: !page,
          cmd: () => Tools.translate(),
        },
        {
          label: "Screenshot",
          accel: "Strg+Umschalt+S",
          disabled: !page,
          cmd: () => Tools.screenshot(),
        },
        {
          label: "Zur Leseliste hinzufügen",
          disabled: !page,
          cmd: () => ReadingList.addCurrent(),
        },
        {
          label: "Auf Seite suchen …",
          accel: "Strg+F",
          cmd: () => FindBar.open(),
        },
        { label: "Vergrößern", accel: "Strg++", cmd: () => Zoom.change(1) },
        { label: "Verkleinern", accel: "Strg+-", cmd: () => Zoom.change(-1) },
        {
          label: "Vollbild",
          accel: "F11",
          cmd: () => (window.fullScreen = !window.fullScreen),
        },
        {
          label: "Seitenquelltext",
          accel: "Strg+U",
          disabled: !page,
          cmd: () =>
            Tabs.open(`view-source:${tab.pageUrl}`, { afterCurrent: true }),
        },
        "-",
        {
          label: Prefs.get("verticalTabs", false)
            ? "Tabs oben anzeigen"
            : "Vertikale Tabs",
          cmd: () => Theme.toggleVerticalTabs(),
        },
        {
          label: "GX Control",
          accel: "Strg+Umschalt+Esc",
          cmd: () => Sidebar.show("control"),
        },
        { label: "Einstellungen", cmd: () => Sidebar.show("settings") },
        "-",
        {
          label: "Beenden",
          cmd: () => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit),
        },
      ],
      anchor
    );
  },
};

const Shortcuts = {
  bindings: [
    ["t", "accel", () => Tabs.open()],
    ["w", "accel", () => Tabs.close(Tabs.selected)],
    ["VK_F4", "accel", () => Tabs.close(Tabs.selected)],
    ["t", "accel,shift", () => Tabs.reopenClosed()],
    ["n", "accel", () => openNewWindow()],
    ["l", "accel", () => Urlbar.focus()],
    ["d", "alt", () => Urlbar.focus()],
    ["VK_F6", "", () => Urlbar.focus()],
    ["k", "accel", () => Urlbar.focus()],
    ["f", "accel", () => FindBar.open()],
    ["VK_F3", "", () => FindBar.next(false)],
    ["VK_F3", "shift", () => FindBar.next(true)],
    ["g", "accel", () => FindBar.next(false)],
    ["+", "accel", () => Zoom.change(1)],
    ["=", "accel", () => Zoom.change(1)],
    ["-", "accel", () => Zoom.change(-1)],
    ["0", "accel", () => Zoom.change(0)],
    ["r", "accel", () => Tabs.selected.linkedBrowser?.reload()],
    ["VK_F5", "", () => Tabs.selected.linkedBrowser?.reload()],
    [
      "r",
      "accel,shift",
      () =>
        Tabs.selected.linkedBrowser?.reloadWithFlags(
          Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE
        ),
    ],
    [
      "VK_F5",
      "accel",
      () =>
        Tabs.selected.linkedBrowser?.reloadWithFlags(
          Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE
        ),
    ],
    ["d", "accel", () => Bookmarks.toggle(Tabs.selected)],
    ["h", "accel", () => Sidebar.toggle("history")],
    ["j", "accel", () => Sidebar.toggle("downloads")],
    ["b", "accel,shift", () => Bookmarks.toggleBar()],
    [
      "u",
      "accel",
      () =>
        Tabs.selected.pageUrl &&
        Tabs.open(`view-source:${Tabs.selected.pageUrl}`, {
          afterCurrent: true,
        }),
    ],
    ["VK_ESCAPE", "accel,shift", () => Sidebar.toggle("control")],
    ["VK_F11", "", () => (window.fullScreen = !window.fullScreen)],
    ["VK_LEFT", "alt", () => Tabs.goBack()],
    ["VK_RIGHT", "alt", () => Tabs.selected.linkedBrowser?.goForward()],
    ["VK_HOME", "alt", () => Tabs.goHome(Tabs.selected)],
    ["VK_PAGE_DOWN", "accel", () => Tabs.cycle(1)],
    ["VK_PAGE_UP", "accel", () => Tabs.cycle(-1)],
    ["VK_ESCAPE", "", () => Shortcuts.escape()],
    ["n", "accel,shift", () => openNewWindow({ private: true })],
    ["p", "accel,shift", () => openNewWindow({ private: true })],
    ["a", "accel,shift", () => TabSearch.toggle()],
    ["s", "accel,shift", () => Tools.screenshot()],
  ],

  init() {
    const keyset = document.createXULElement("keyset");
    for (const [key, modifiers, fn] of this.bindings) {
      keyset.append(this.makeKey(key, modifiers, fn));
    }
    for (let i = 1; i <= 9; i++) {
      keyset.append(
        this.makeKey(String(i), "accel", () =>
          Tabs.selectIndex(i == 9 ? -1 : i - 1)
        )
      );
    }
    document.body.append(keyset);

    window.addEventListener(
      "keydown",
      e => {
        if (e.ctrlKey && e.key == "Tab") {
          e.preventDefault();
          e.stopPropagation();
          Tabs.cycle(e.shiftKey ? -1 : 1);
        }
      },
      true
    );
    window.addEventListener("DoZoomEnlargeBy10", () => Zoom.change(1), true);
    window.addEventListener("DoZoomReduceBy10", () => Zoom.change(-1), true);
  },

  makeKey(key, modifiers, fn) {
    const k = document.createXULElement("key");
    k.setAttribute(key.startsWith("VK_") ? "keycode" : "key", key);
    if (modifiers) {
      k.setAttribute("modifiers", modifiers);
    }
    k.addEventListener("command", fn);
    return k;
  },

  escape() {
    if (!FindBar.bar.hidden) {
      FindBar.close();
    } else if (Tabs.selected.hasAttribute("busy")) {
      Tabs.selected.linkedBrowser?.stop();
    }
  },
};

const FRESH_WINDOW = "geckogx:fresh";
const START_PAGES = new Set([
  "",
  "about:home",
  "about:newtab",
  "about:blank",
  "about:welcome",
  "about:privatebrowsing",
]);

function openNewWindow({ private: isPrivate = false, url = null } = {}) {
  const args = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  for (const value of [FRESH_WINDOW, url].filter(Boolean)) {
    const str = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    str.data = value;
    args.appendElement(str);
  }
  Services.ww.openWindow(
    null,
    "chrome://browser/content/browser.xhtml",
    "_blank",
    `chrome,dialog=no,all${isPrivate ? ",private" : ""}`,
    args
  );
}

function openPrivateWithUrl(url) {
  openNewWindow({ private: true, url });
}

/**
 * Reads the URLs Gecko passes to a new browser window (for example when
 * another program opens a link).
 *
 * @returns {{fresh: boolean, urls: string[]}}
 */
function windowArguments() {
  const strings = [];
  const add = value => {
    if (value instanceof Ci.nsISupportsString) {
      strings.push(value.data);
    } else if (typeof value == "string") {
      strings.push(value);
    }
  };
  for (const arg of window.arguments ?? []) {
    if (arg instanceof Ci.nsIArray) {
      for (let i = 0; i < arg.length; i++) {
        add(arg.queryElementAt(i, Ci.nsISupports));
      }
    } else {
      add(arg);
    }
  }
  const fresh = strings.includes(FRESH_WINDOW);
  const urls = strings
    .filter(s => s != FRESH_WINDOW)
    .flatMap(s => s.split("|"))
    .map(s => s.trim())
    .filter(s => !START_PAGES.has(s) && /^[a-z][a-z0-9+.-]*:/i.test(s));
  return { fresh, urls };
}

/**
 * Sends URLs to an already open Gecko GX window instead of opening a second
 * one, like Chrome does for links from other programs.
 *
 * @param {string[]} urls
 * @returns {boolean} Whether another window took the URLs.
 */
function forwardToExistingWindow(urls) {
  if (!urls.length || isPrivateWindow) {
    return false;
  }
  for (const win of Services.wm.getEnumerator("geckogx:main")) {
    if (
      win != window &&
      !win.closed &&
      !Modules.PrivateBrowsingUtils.isWindowPrivate(win) &&
      win.GeckoGX
    ) {
      win.GeckoGX.openTabs(urls);
      win.focus();
      return true;
    }
  }
  return false;
}

async function setupSearchEngine() {
  if (Prefs.get("searchSetup", false)) {
    return;
  }
  try {
    await Search.ready;
    let engine = Modules.SearchService.getEngineByName("Brave Search");
    engine ??= await Modules.SearchService.addUserEngine({
      name: "Brave Search",
      url: "https://search.brave.com/search?q={searchTerms}",
      suggestUrl: "https://search.brave.com/api/suggest?q={searchTerms}",
    });
    await Modules.SearchService.setDefault(
      engine,
      Modules.SearchService.CHANGE_REASON.USER
    );
    Prefs.set("searchSetup", true);
  } catch (e) {
    console.error(e);
  }
}

const isPrivateWindow = Modules.PrivateBrowsingUtils.isWindowPrivate(window);

window.addEventListener(
  "DOMContentLoaded",
  () => {
    window.docShell.treeOwner
      .QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIAppWindow).XULBrowserWindow = window.XULBrowserWindow;
  },
  { once: true }
);

window.addEventListener(
  "load",
  () => {
    const { fresh, urls } = windowArguments();
    if (forwardToExistingWindow(urls)) {
      window.close();
      return;
    }
    document.documentElement.toggleAttribute("private", isPrivateWindow);
    window.GeckoGX = {
      get tabs() {
        return Tabs.list;
      },
      openTabs(list) {
        for (const url of list) {
          Tabs.open(url);
        }
      },
    };
    applyIcons();
    Theme.apply();
    Tabs.init();
    Integration.init();
    PopupNotifications.init();
    Shields.init();
    TabSearch.init();
    Urlbar.init();
    Toolbar.init();
    FindBar.init();
    Sidebar.init();
    Control.init();
    Start.init();
    Bookmarks.init();
    DownloadsView.init();
    Shortcuts.init();
    Tabs.restoreSession(fresh || isPrivateWindow, !!urls.length);
    for (const url of urls) {
      Tabs.open(url);
    }
    setupSearchEngine();
    Modules.GXStartup.windowReady();
  },
  { once: true }
);

window.addEventListener("unload", () => Tabs.saveSession());
