/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from minibrowser.js */
/* import-globals-from gx-tabs.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-notify.js */
/* import-globals-from gx-shields.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

const CALC_FUNCTIONS = {
  sqrt: Math.sqrt,
  wurzel: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  round: Math.round,
};
const CALC_CONSTANTS = { pi: Math.PI, e: Math.E };

/**
 * A small arithmetic parser for the address bar. Never uses eval.
 */
const Calc = {
  evaluate(input) {
    const text = input
      .trim()
      .replace(/^=/, "")
      .replace(/,/g, ".")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!text || !/^[\d.+\-*/^%()a-z]+$/.test(text) || !/\d|pi/.test(text)) {
      return null;
    }
    if (!/[+\-*/^%(]/.test(text.replace(/^-/, ""))) {
      return null;
    }
    this.tokens = text.match(/\d*\.?\d+|[a-z]+|[+\-*/^%()]/g) ?? [];
    this.pos = 0;
    try {
      const value = this.expr();
      return this.pos == this.tokens.length && Number.isFinite(value)
        ? value
        : null;
    } catch {
      return null;
    }
  },

  peek() {
    return this.tokens[this.pos];
  },

  next() {
    return this.tokens[this.pos++];
  },

  expr() {
    let v = this.term();
    while (this.peek() == "+" || this.peek() == "-") {
      v = this.next() == "+" ? v + this.term() : v - this.term();
    }
    return v;
  },

  term() {
    let v = this.power();
    while (["*", "/", "%"].includes(this.peek())) {
      const op = this.next();
      const rhs = this.power();
      if (op == "*") {
        v *= rhs;
      } else if (op == "/") {
        v /= rhs;
      } else {
        v %= rhs;
      }
    }
    return v;
  },

  power() {
    const base = this.unary();
    if (this.peek() == "^") {
      this.next();
      return base ** this.power();
    }
    return base;
  },

  unary() {
    if (this.peek() == "-") {
      this.next();
      return -this.unary();
    }
    return this.primary();
  },

  primary() {
    const token = this.next();
    if (token == "(") {
      const v = this.expr();
      if (this.next() != ")") {
        throw new Error("paren");
      }
      return v;
    }
    if (/^\d*\.?\d+$/.test(token)) {
      return parseFloat(token);
    }
    if (token in CALC_CONSTANTS) {
      return CALC_CONSTANTS[token];
    }
    if (token in CALC_FUNCTIONS && this.next() == "(") {
      const v = this.expr();
      if (this.next() != ")") {
        throw new Error("paren");
      }
      return CALC_FUNCTIONS[token](v);
    }
    throw new Error("token");
  },

  format(value) {
    return (+value.toPrecision(12)).toLocaleString("de-DE", {
      maximumFractionDigits: 10,
    });
  },
};

const UNIT_GROUPS = [
  {
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    mi: 1609.344,
    meilen: 1609.344,
    ft: 0.3048,
    fuß: 0.3048,
    in: 0.0254,
    zoll: 0.0254,
    yd: 0.9144,
  },
  {
    kg: 1,
    g: 0.001,
    mg: 1e-6,
    t: 1000,
    lb: 0.45359237,
    lbs: 0.45359237,
    pfund: 0.5,
    oz: 0.028349523125,
  },
  {
    l: 1,
    ml: 0.001,
    cl: 0.01,
    gal: 3.785411784,
    pt: 0.473176473,
    cup: 0.2365882365,
  },
  { "km/h": 1, kmh: 1, mph: 1.609344, "m/s": 3.6, kn: 1.852 },
  {
    b: 1,
    kb: 1e3,
    mb: 1e6,
    gb: 1e9,
    tb: 1e12,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
  },
];

const Units = {
  convert(input) {
    const match =
      /^(-?[\d.,]+)\s*([a-zß°/]+)\s+(?:in|to|zu|nach|=)\s+([a-zß°/]+)$/i.exec(
        input.trim()
      );
    if (!match) {
      return null;
    }
    const value = parseFloat(match[1].replace(",", "."));
    const from = match[2].toLowerCase().replace("°", "");
    const to = match[3].toLowerCase().replace("°", "");
    const temp = this.temperature(value, from, to);
    if (temp != null) {
      return `${Calc.format(temp)} °${to.toUpperCase()}`;
    }
    for (const group of UNIT_GROUPS) {
      if (from in group && to in group) {
        return `${Calc.format((value * group[from]) / group[to])} ${match[3]}`;
      }
    }
    return null;
  },

  temperature(value, from, to) {
    const toKelvin = {
      c: v => v + 273.15,
      f: v => ((v - 32) * 5) / 9 + 273.15,
      k: v => v,
    };
    const fromKelvin = {
      c: v => v - 273.15,
      f: v => ((v - 273.15) * 9) / 5 + 32,
      k: v => v,
    };
    if (!(from in toKelvin) || !(to in fromKelvin)) {
      return null;
    }
    return fromKelvin[to](toKelvin[from](value));
  },
};

const Toast = {
  timer: 0,
  show(message, action) {
    const toast = $("toast");
    toast.replaceChildren(
      el("span", {}, message),
      action
        ? el(
            "button",
            {
              class: "text-btn",
              onclick: () => {
                toast.hidden = true;
                action.cmd();
              },
            },
            action.label
          )
        : null
    );
    toast.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (toast.hidden = true), 5000);
  },
};

function localFile(path) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  return file;
}

const Tools = {
  translate(tab = Tabs.selected) {
    if (!tab?.pageUrl || tab.startPage || !/^https?:/.test(tab.pageUrl)) {
      return;
    }
    Tabs.load(
      tab,
      `https://translate.google.com/translate?sl=auto&tl=de&u=${encodeURIComponent(tab.pageUrl)}`
    );
  },

  async screenshot() {
    const tab = Tabs.selected;
    const wg = tab?.startPage
      ? null
      : tab?.linkedBrowser?.browsingContext?.currentWindowGlobal;
    if (!wg) {
      return;
    }
    try {
      const bitmap = await wg.drawSnapshot(
        null,
        window.devicePixelRatio,
        "white"
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/png")
      );
      const dir = await Modules.Downloads.getPreferredDownloadsDirectory();
      const stamp = new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-");
      const path = PathUtils.join(dir, `Screenshot ${stamp}.png`);
      await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
      Sound.play("toggle");
      Toast.show("Screenshot in Downloads gespeichert", {
        label: "Öffnen",
        cmd: () => localFile(path).launch(),
      });
    } catch (e) {
      console.error(e);
      Toast.show("Screenshot fehlgeschlagen");
    }
  },

  toggleQR() {
    const popup = $("qr-popup");
    if (!popup.hidden) {
      popup.hidden = true;
      return;
    }
    const tab = Tabs.selected;
    if (!tab?.pageUrl || tab.startPage) {
      return;
    }
    const { src } = Modules.QR.encodeToDataURI(tab.pageUrl, "L");
    const rect = $("qr-btn").getBoundingClientRect();
    popup.style.top = `${rect.bottom + 6}px`;
    popup.style.left = `${Math.max(8, rect.right - 260)}px`;
    popup.replaceChildren(
      el("b", {}, "QR-Code für diese Seite"),
      el("img", { src, alt: "QR-Code" }),
      el("span", { class: "muted" }, hostOf(tab.pageUrl))
    );
    popup.hidden = false;
  },
};

const ReadingList = {
  get items() {
    return Prefs.get("readingList", []);
  },

  save(items) {
    Prefs.set("readingList", items);
    if (Sidebar.current == "reading") {
      this.show();
    }
  },

  add(url, title) {
    if (!url || !/^https?:/.test(url)) {
      return;
    }
    const items = this.items.filter(i => i.url != url);
    items.unshift({ url, title: title || url, added: Date.now(), read: false });
    this.save(items);
    Sound.play("toggle");
    Toast.show("Zur Leseliste hinzugefügt", {
      label: "Anzeigen",
      cmd: () => Sidebar.show("reading"),
    });
  },

  addCurrent() {
    const tab = Tabs.selected;
    if (tab && !tab.startPage) {
      this.add(tab.pageUrl, Tabs.label(tab));
    }
  },

  show() {
    const items = this.items;
    const list = $("reading-list");
    const row = item => {
      const r = listItem({
        url: item.url,
        title: item.title,
        sub: `${hostOf(item.url)} · ${new Date(item.added).toLocaleDateString("de-DE")}`,
        removeIcon: "trash",
        onRemove: () => this.save(this.items.filter(i => i.url != item.url)),
      });
      r.addEventListener("click", () => {
        this.save(
          this.items.map(i => (i.url == item.url ? { ...i, read: true } : i))
        );
      });
      return r;
    };
    const unread = items.filter(i => !i.read);
    const read = items.filter(i => i.read);
    list.replaceChildren(
      ...(unread.length
        ? [el("div", { class: "group" }, "Ungelesen"), ...unread.map(row)]
        : []),
      ...(read.length
        ? [el("div", { class: "group" }, "Gelesen"), ...read.map(row)]
        : [])
    );
    if (!items.length) {
      list.append(
        el(
          "div",
          { class: "empty" },
          "Die Leseliste ist leer. Seiten mit dem Buch-Symbol oder per Rechtsklick auf Links speichern."
        )
      );
    }
  },
};

const PasswordsView = {
  initialized: false,

  show() {
    if (!this.initialized) {
      this.initialized = true;
      $("passwords-search").addEventListener("input", () => this.render());
    }
    this.render();
  },

  async render() {
    const q = $("passwords-search").value.trim().toLowerCase();
    let logins = [];
    try {
      logins = await Services.logins.getAllLogins();
    } catch (e) {
      console.error(e);
    }
    logins = logins
      .filter(
        l =>
          !q ||
          l.origin.toLowerCase().includes(q) ||
          l.username.toLowerCase().includes(q)
      )
      .sort((a, b) => a.origin.localeCompare(b.origin));
    const list = $("passwords-list");
    list.replaceChildren(
      ...logins.map(login =>
        el(
          "div",
          { class: "item", title: login.origin },
          siteIcon(login.origin, null, "fallback"),
          el(
            "span",
            { class: "text" },
            el("span", {}, hostOf(login.origin) || login.origin),
            el(
              "span",
              { class: "sub" },
              login.username || "(kein Benutzername)"
            )
          ),
          el("button", {
            class: "icon-btn",
            title: "Benutzername kopieren",
            icon: "user",
            onclick: () => {
              copyToClipboard(login.username);
              Toast.show("Benutzername kopiert");
            },
          }),
          el("button", {
            class: "icon-btn",
            title: "Passwort kopieren",
            icon: "key",
            onclick: () => {
              copyToClipboard(login.password);
              Toast.show("Passwort kopiert");
            },
          }),
          el("button", {
            class: "icon-btn",
            title: "Löschen",
            icon: "trash",
            onclick: () => {
              if (
                Services.prompt.confirm(
                  window,
                  "Passwort löschen",
                  `Login für ${hostOf(login.origin)} löschen?`
                )
              ) {
                Services.logins.removeLogin(login);
                this.render();
              }
            },
          })
        )
      )
    );
    if (!logins.length) {
      list.append(
        el(
          "div",
          { class: "empty" },
          q
            ? "Keine Treffer."
            : "Noch keine Passwörter. Gecko GX fragt nach dem Anmelden, ob es speichern soll."
        )
      );
    }
  },
};

const TabSearch = {
  index: 0,

  init() {
    this.box = $("tabsearch");
    this.input = $("tabsearch-input");
    this.input.addEventListener("input", () => {
      this.index = 0;
      this.render();
    });
    this.input.addEventListener("keydown", e => {
      const n = this.results.length;
      if (e.key == "ArrowDown" || e.key == "ArrowUp") {
        e.preventDefault();
        this.index =
          (this.index + (e.key == "ArrowDown" ? 1 : n - 1)) % Math.max(n, 1);
        this.render();
      } else if (e.key == "Enter") {
        this.pick(this.results[this.index]);
      } else if (e.key == "Escape") {
        this.hide();
      }
    });
    this.box.addEventListener("mousedown", e => {
      if (e.target == this.box) {
        this.hide();
      }
    });
  },

  toggle() {
    if (this.box.hidden) {
      this.box.hidden = false;
      this.input.value = "";
      this.index = 0;
      this.render();
      this.input.focus();
    } else {
      this.hide();
    }
  },

  hide() {
    this.box.hidden = true;
  },

  pick(result) {
    if (!result) {
      return;
    }
    this.hide();
    if (result.tab) {
      Tabs.select(result.tab);
    } else {
      Tabs.closed.splice(Tabs.closed.indexOf(result.closed), 1);
      Tabs.open(result.closed.url, { title: result.closed.title });
    }
  },

  render() {
    const q = this.input.value.trim().toLowerCase();
    const hit = (title, url) =>
      !q || title.toLowerCase().includes(q) || url.toLowerCase().includes(q);
    this.results = [
      ...Tabs.list
        .filter(t => hit(Tabs.label(t), t.pageUrl || ""))
        .map(tab => ({ tab, title: Tabs.label(tab), url: tab.pageUrl })),
      ...[...Tabs.closed]
        .reverse()
        .filter(c => hit(c.title || "", c.url))
        .map(closed => ({
          closed,
          title: closed.title || closed.url,
          url: closed.url,
        })),
    ];
    const list = $("tabsearch-list");
    let lastKind = "";
    list.replaceChildren();
    this.results.forEach((r, i) => {
      const kind = r.tab ? "Offene Tabs" : "Kürzlich geschlossen";
      if (kind != lastKind) {
        list.append(el("div", { class: "group" }, kind));
        lastKind = kind;
      }
      const row = el(
        "div",
        {
          class: "item",
          onmousedown: e => {
            e.preventDefault();
            this.pick(r);
          },
        },
        r.url ? siteIcon(r.url, null, "fallback") : makeIcon("home"),
        el(
          "span",
          { class: "text" },
          el("span", {}, r.title),
          el("span", { class: "sub" }, r.url || "Startseite")
        )
      );
      row.toggleAttribute("selected", i == this.index);
      list.append(row);
    });
    if (!this.results.length) {
      list.append(el("div", { class: "empty" }, "Keine Tabs gefunden."));
    }
  },
};
