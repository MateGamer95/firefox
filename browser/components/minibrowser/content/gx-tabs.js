/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from minibrowser.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

const WPL = Ci.nsIWebProgressListener;
const BLOCKED_FLAGS =
  WPL.STATE_BLOCKED_TRACKING_CONTENT |
  WPL.STATE_BLOCKED_SOCIALTRACKING_CONTENT |
  WPL.STATE_BLOCKED_CRYPTOMINING_CONTENT |
  WPL.STATE_BLOCKED_FINGERPRINTING_CONTENT;

/**
 *
 */
class TabProgressListener {
  QueryInterface = ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]);

  constructor(tab) {
    this.tab = tab;
  }

  onLocationChange(webProgress, request, location, flags) {
    if (!webProgress.isTopLevel) {
      return;
    }
    const tab = this.tab;
    const spec = location.spec;
    if (spec != "about:blank" || !tab.pageUrl) {
      tab.pageUrl = spec;
    }
    if (!(flags & WPL.LOCATION_CHANGE_SAME_DOCUMENT)) {
      tab.blocked = 0;
      tab.iconUrl = null;
    }
    Tabs.updateTab(tab);
    if (tab == Tabs.selected) {
      Tabs.syncUI();
    }
    Tabs.scheduleSave();
  }

  onStateChange(webProgress, request, stateFlags) {
    if (!webProgress.isTopLevel || !(stateFlags & WPL.STATE_IS_NETWORK)) {
      return;
    }
    if (stateFlags & WPL.STATE_START) {
      this.tab.toggleAttribute("busy", true);
    } else if (stateFlags & WPL.STATE_STOP) {
      this.tab.removeAttribute("busy");
      if (this.tab == Tabs.selected) {
        Tabs.setStatus("");
      }
    }
    Tabs.updateTab(this.tab);
    if (this.tab == Tabs.selected) {
      Tabs.syncUI();
    }
  }

  onStatusChange(webProgress, request, status, message) {
    if (this.tab == Tabs.selected) {
      Tabs.setStatus(message);
    }
  }

  onSecurityChange(webProgress, request, state) {
    this.tab.secure = !!(state & WPL.STATE_IS_SECURE);
    if (this.tab == Tabs.selected) {
      Toolbar.update(this.tab);
    }
  }

  onContentBlockingEvent(webProgress, request, event) {
    if (event & BLOCKED_FLAGS) {
      Control.countBlocked(this.tab);
    }
  }

  onProgressChange() {}
}

const Tabs = {
  list: [],
  selected: null,
  closed: [],
  dragged: null,
  saveTimer: 0,
  overLink: "",

  init() {
    this.strip = $("tabs");
    this.box = $("browsers");
    $("newtab").addEventListener("click", () => this.open());
    $("tabstrip").addEventListener("dblclick", e => {
      if (e.target.id == "tabstrip" || e.target.id == "tabs") {
        this.open();
      }
    });
    this.strip.addEventListener("wheel", e => {
      this.strip.scrollLeft += e.deltaY;
    });
    this.strip.addEventListener("dragover", e => this.onDragOver(e));
    this.strip.addEventListener("drop", e => {
      e.preventDefault();
      this.finishDrag();
    });

    window.addEventListener(
      "DOMWindowClose",
      e => {
        const tab = e.target._gxTab;
        if (tab) {
          e.preventDefault();
          this.close(tab);
        }
      },
      true
    );
    window.addEventListener(
      "pagetitlechanged",
      e => {
        const tab = e.target._gxTab;
        if (tab) {
          this.updateTab(tab);
          if (tab == this.selected) {
            this.syncUI();
          }
        }
      },
      true
    );
  },

  createTabElement() {
    const tab = el(
      "div",
      { class: "tab", draggable: "true" },
      el("img", { class: "tab-icon", alt: "" }),
      el("span", { class: "tab-letter" }),
      el("span", { class: "tab-title" }),
      el("button", {
        class: "icon-btn tab-audio",
        title: "Stummschalten",
        icon: "speaker",
      }),
      el("button", {
        class: "icon-btn tab-close",
        title: "Tab schließen (Strg+W)",
        icon: "close",
      })
    );
    tab.toggleAttribute("noicon", true);
    tab.querySelector(".tab-icon").addEventListener("error", () => {
      tab.toggleAttribute("noicon", true);
    });
    tab.querySelector(".tab-icon").addEventListener("load", () => {
      tab.removeAttribute("noicon");
    });
    tab.addEventListener("mousedown", e => {
      if (e.button == 0 && !e.target.closest(".icon-btn")) {
        this.select(tab);
      }
    });
    tab.addEventListener("auxclick", e => {
      if (e.button == 1) {
        e.preventDefault();
        this.close(tab);
      }
    });
    tab
      .querySelector(".tab-close")
      .addEventListener("click", () => this.close(tab));
    tab
      .querySelector(".tab-audio")
      .addEventListener("click", () => this.toggleMute(tab));
    tab.addEventListener("contextmenu", e => {
      e.preventDefault();
      this.openContextMenu(tab, e);
    });
    tab.addEventListener("dragstart", e => {
      this.dragged = tab;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tab.pageUrl || "");
    });
    tab.addEventListener("dragend", () => this.finishDrag());
    return tab;
  },

  /**
   * Opens a new tab.
   *
   * @param {string|null} url  null opens the start page.
   * @param {object} opts
   *   background, afterCurrent, Modules (restore without loading), title,
   *   openWindowInfo/name/remoteType (popups), skipLoad, plus load params.
   */
  open(url = null, opts = {}) {
    const tab = this.createTabElement();
    tab.pageUrl = url || "";
    tab.pageTitle = opts.title || "";
    tab.startPage = !url && !opts.openWindowInfo && !opts.skipLoad;
    tab.lastActive = Date.now();
    tab.blocked = 0;

    let index = this.list.length;
    if (opts.afterCurrent && this.selected) {
      index = this.list.indexOf(this.selected) + 1;
      while (this.list[index]?.openerTab == this.selected) {
        index++;
      }
      tab.openerTab = this.selected;
    }
    this.list.splice(index, 0, tab);
    this.strip.insertBefore(tab, this.strip.children[index] ?? null);

    if (opts.Modules && url) {
      tab.unloaded = true;
      tab.toggleAttribute("sleeping", true);
    } else if (url || opts.openWindowInfo || opts.skipLoad) {
      this.createBrowser(tab, opts);
      if (url && !opts.skipLoad) {
        this.load(tab, url, opts);
      }
    }
    this.updateTab(tab);
    if (!opts.background) {
      this.select(tab);
    }
    Sound.play("open");
    this.scheduleSave();
    return tab;
  },

  createBrowser(tab, { openWindowInfo, name, remoteType } = {}) {
    const b = document.createXULElement("browser");
    const attrs = {
      type: "content",
      remote: "true",
      maychangeremoteness: "true",
      messagemanagergroup: "browsers",
      manualactiveness: "true",
      message: "true",
      nodefaultsrc: "true",
    };
    for (const [key, value] of Object.entries(attrs)) {
      b.setAttribute(key, value);
    }
    if (remoteType) {
      b.setAttribute("remoteType", remoteType);
    }
    if (name) {
      b.setAttribute("name", name);
    }
    if (openWindowInfo) {
      b.openWindowInfo = openWindowInfo;
    }
    b.permanentKey = new (Cu.getGlobalForObject(Services).Object)();
    b._gxTab = tab;
    tab.linkedBrowser = b;
    this.box.append(b);
    tab.listener = new TabProgressListener(tab);
    b.addProgressListener(
      tab.listener,
      Ci.nsIWebProgress.NOTIFY_STATE_WINDOW |
        Ci.nsIWebProgress.NOTIFY_LOCATION |
        Ci.nsIWebProgress.NOTIFY_STATUS |
        Ci.nsIWebProgress.NOTIFY_SECURITY |
        Ci.nsIWebProgress.NOTIFY_CONTENT_BLOCKING
    );
    this.setActive(tab, tab == this.selected);
    return b;
  },

  destroyBrowser(tab) {
    const b = tab.linkedBrowser;
    if (!b) {
      return;
    }
    try {
      b.removeProgressListener(tab.listener);
    } catch {}
    if (FindBar.attached == b.finder) {
      FindBar.close();
    }
    b.remove();
    tab.linkedBrowser = null;
    tab.listener = null;
  },

  setActive(tab, active) {
    const b = tab.linkedBrowser;
    if (!b) {
      return;
    }
    b.classList.toggle("active", active);
    if (active) {
      b.setAttribute("primary", "true");
    } else {
      b.removeAttribute("primary");
    }
    try {
      b.docShellIsActive = active;
    } catch {}
  },

  load(tab, target, opts = {}) {
    if (!tab) {
      return;
    }
    if (!tab.linkedBrowser) {
      tab.unloaded = false;
      tab.removeAttribute("sleeping");
      this.createBrowser(tab);
    }
    tab.startPage = false;
    const b = tab.linkedBrowser;
    const params = {
      triggeringPrincipal: opts.triggeringPrincipal ?? SYSTEM_PRINCIPAL,
      referrerInfo: opts.referrerInfo,
      policyContainer: opts.policyContainer,
      hasValidUserGestureActivation: !!opts.hasValidUserGestureActivation,
    };
    try {
      if (target instanceof Ci.nsIURI) {
        tab.pageUrl = target.spec;
        b.loadURI(target, params);
      } else {
        tab.pageUrl = target;
        b.fixupAndLoadURIString(target, {
          ...params,
          loadFlags:
            Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP |
            Ci.nsIWebNavigation.LOAD_FLAGS_FIXUP_SCHEME_TYPOS,
        });
      }
    } catch (e) {
      console.error(e);
      this.setStatus(`Kann nicht geladen werden: ${target}`);
    }
    this.updateTab(tab);
    if (tab == this.selected) {
      this.syncUI();
      b.focus();
    }
  },

  select(tab) {
    if (!tab) {
      return;
    }
    if (tab == this.selected) {
      this.syncUI();
      return;
    }
    const prev = this.selected;
    if (prev) {
      prev.removeAttribute("selected");
      this.setActive(prev, false);
    }
    FindBar.close();
    this.selected = tab;
    tab.toggleAttribute("selected", true);
    tab.lastActive = Date.now();
    if (tab.unloaded && tab.pageUrl) {
      this.load(tab, tab.pageUrl);
    }
    this.setActive(tab, true);
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    this.syncUI();
    if (tab.startPage) {
      Start.focusSearch();
    } else {
      tab.linkedBrowser?.focus();
    }
    this.scheduleSave();
  },

  selectIndex(i) {
    this.select(i < 0 ? this.list.at(-1) : this.list[i]);
  },

  cycle(dir) {
    const n = this.list.length;
    const i = this.list.indexOf(this.selected);
    this.select(this.list[(i + dir + n) % n]);
  },

  close(tab) {
    const i = this.list.indexOf(tab);
    if (i < 0) {
      return;
    }
    if (tab.pageUrl && !tab.startPage && tab.pageUrl != "about:blank") {
      this.closed.push({ url: tab.pageUrl, title: tab.pageTitle });
      if (this.closed.length > 25) {
        this.closed.shift();
      }
    }
    this.destroyBrowser(tab);
    this.list.splice(i, 1);
    tab.remove();
    for (const t of this.list) {
      if (t.openerTab == tab) {
        t.openerTab = null;
      }
    }
    Sound.play("close");
    if (this.selected == tab) {
      this.selected = null;
      const next =
        tab.openerTab && this.list.includes(tab.openerTab)
          ? tab.openerTab
          : this.list[Math.min(i, this.list.length - 1)];
      if (next) {
        this.select(next);
      }
    }
    if (!this.list.length) {
      this.open();
    }
    this.scheduleSave();
  },

  closeOthers(tab) {
    for (const t of [...this.list]) {
      if (t != tab) {
        this.close(t);
      }
    }
  },

  closeToRight(tab) {
    for (const t of this.list.slice(this.list.indexOf(tab) + 1)) {
      this.close(t);
    }
  },

  reopenClosed() {
    const entry = this.closed.pop();
    if (entry) {
      this.open(entry.url, { title: entry.title });
    }
  },

  duplicate(tab) {
    if (tab.pageUrl && !tab.startPage) {
      this.open(tab.pageUrl, { afterCurrent: true, title: tab.pageTitle });
    } else {
      this.open();
    }
  },

  /**
   * Discards the content of a background tab to free memory. It reloads when
   * selected again.
   *
   * @param {Element} tab
   * @returns {boolean} Whether the tab was unloaded.
   */
  unload(tab) {
    if (
      tab == this.selected ||
      !tab.linkedBrowser ||
      !tab.pageUrl ||
      tab.startPage
    ) {
      return false;
    }
    this.destroyBrowser(tab);
    tab.unloaded = true;
    tab.toggleAttribute("sleeping", true);
    tab.removeAttribute("soundplaying");
    tab.removeAttribute("busy");
    this.updateTab(tab);
    return true;
  },

  goBack() {
    const tab = this.selected;
    if (tab.startPage && tab.linkedBrowser) {
      tab.startPage = false;
      this.updateTab(tab);
      this.syncUI();
      tab.linkedBrowser.focus();
    } else {
      tab.linkedBrowser?.goBack();
    }
  },

  goHome(tab) {
    const home = Prefs.get("homepage", "");
    if (home) {
      this.load(tab, home);
      return;
    }
    tab.startPage = true;
    this.updateTab(tab);
    this.syncUI();
    Start.focusSearch();
  },

  toggleMute(tab) {
    const b = tab.linkedBrowser;
    if (!b) {
      return;
    }
    if (b.audioMuted) {
      b.unmute();
    } else {
      b.mute();
    }
    tab.toggleAttribute("muted", b.audioMuted);
    setIcon(
      tab.querySelector(".tab-audio"),
      b.audioMuted ? "muted" : "speaker"
    );
  },

  pollAudio() {
    for (const tab of this.list) {
      let audible = false;
      try {
        audible =
          !!tab.linkedBrowser?.browsingContext?.mediaController?.isAudible;
      } catch {}
      if (audible != tab.hasAttribute("soundplaying")) {
        tab.toggleAttribute("soundplaying", audible);
      }
    }
  },

  label(tab) {
    if (tab.startPage) {
      return "Startseite";
    }
    return (
      tab.linkedBrowser?.contentTitle ||
      tab.pageTitle ||
      hostOf(tab.pageUrl) ||
      tab.pageUrl ||
      "Neuer Tab"
    );
  },

  updateTab(tab) {
    const title = tab.linkedBrowser?.contentTitle;
    if (title) {
      tab.pageTitle = title;
    }
    const label = this.label(tab);
    tab.querySelector(".tab-title").textContent = label;
    tab.setAttribute(
      "title",
      tab.hasAttribute("sleeping") ? `${label} (schläft)` : label
    );
    const host = hostOf(tab.pageUrl).replace(/^www\./, "");
    tab.querySelector(".tab-letter").textContent = tab.startPage
      ? "G"
      : (host[0] || label[0] || "?").toUpperCase();

    const img = tab.querySelector(".tab-icon");
    let src = "";
    if (!tab.startPage) {
      src =
        tab.iconUrl ||
        (/^https?:/.test(tab.pageUrl) ? `page-icon:${tab.pageUrl}` : "");
    }
    if (img.getAttribute("src") != src) {
      tab.toggleAttribute("noicon", true);
      if (src) {
        img.src = src;
      } else {
        img.removeAttribute("src");
      }
    }
  },

  setIcon(tab, iconUrl) {
    tab.iconUrl = iconUrl;
    this.updateTab(tab);
  },

  setStatus(text) {
    const status = $("status");
    const shown = this.overLink || text;
    status.textContent = shown;
    status.hidden = !shown;
  },

  syncUI() {
    const tab = this.selected;
    if (!tab) {
      return;
    }
    document.body.classList.toggle("show-start", !!tab.startPage);
    Toolbar.update(tab);
    document.title = `${this.label(tab)} – Gecko GX`;
    Start.updateWidgets();
  },

  onDragOver(e) {
    if (!this.dragged) {
      return;
    }
    e.preventDefault();
    const target = e.target.closest(".tab");
    if (!target || target == this.dragged) {
      return;
    }
    const rect = target.getBoundingClientRect();
    if (e.clientX > rect.left + rect.width / 2) {
      target.after(this.dragged);
    } else {
      target.before(this.dragged);
    }
  },

  finishDrag() {
    if (!this.dragged) {
      return;
    }
    this.dragged = null;
    this.list = [...this.strip.querySelectorAll(".tab")];
    this.scheduleSave();
  },

  openContextMenu(tab, event) {
    const b = tab.linkedBrowser;
    Menu.showAt(
      $("tabContextMenu"),
      [
        { label: "Neuer Tab", cmd: () => this.open() },
        "-",
        { label: "Neu laden", disabled: !b, cmd: () => b.reload() },
        { label: "Duplizieren", cmd: () => this.duplicate(tab) },
        {
          label: tab.hasAttribute("muted")
            ? "Ton einschalten"
            : "Stummschalten",
          disabled: !b,
          cmd: () => this.toggleMute(tab),
        },
        {
          label: "Schlafen legen",
          disabled: tab == this.selected || !b || tab.startPage,
          cmd: () => this.unload(tab),
        },
        {
          label: "Link kopieren",
          disabled: !tab.pageUrl || tab.startPage,
          cmd: () => copyToClipboard(tab.pageUrl),
        },
        "-",
        { label: "Rechte Tabs schließen", cmd: () => this.closeToRight(tab) },
        { label: "Andere Tabs schließen", cmd: () => this.closeOthers(tab) },
        { label: "Tab schließen", cmd: () => this.close(tab) },
        "-",
        {
          label: "Geschlossenen Tab wiederherstellen",
          disabled: !this.closed.length,
          cmd: () => this.reopenClosed(),
        },
      ],
      event
    );
  },

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveSession(), 1000);
  },

  saveSession() {
    if (!this.list.length) {
      return;
    }
    Prefs.set("session", {
      tabs: this.list.map(t => ({
        url: t.startPage || t.pageUrl == "about:blank" ? "" : t.pageUrl,
        title: t.pageTitle,
      })),
      selected: this.list.indexOf(this.selected),
    });
  },

  restoreSession(fresh) {
    const session =
      !fresh && Prefs.get("restoreSession", true)
        ? Prefs.get("session", null)
        : null;
    Sound.suspended = true;
    if (session?.tabs?.length) {
      for (const t of session.tabs) {
        this.open(t.url || null, {
          title: t.title,
          background: true,
          Modules: true,
        });
      }
      this.select(this.list[session.selected] ?? this.list[0]);
    } else {
      this.open(Prefs.get("homepage", "") || null);
    }
    Sound.suspended = false;
  },
};
