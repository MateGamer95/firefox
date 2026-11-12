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
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

const DEFAULT_PANELS = [
  { id: "discord", name: "Discord", url: "https://discord.com/app" },
  { id: "twitch", name: "Twitch", url: "https://www.twitch.tv/" },
  { id: "whatsapp", name: "WhatsApp", url: "https://web.whatsapp.com/" },
  { id: "telegram", name: "Telegram", url: "https://web.telegram.org/k/" },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com/" },
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com/" },
];

const VIEW_TITLES = {
  control: "GX Control",
  history: "Verlauf",
  bookmarks: "Lesezeichen",
  downloads: "Downloads",
  reading: "Leseliste",
  passwords: "Passwörter",
  settings: "Einstellungen",
};

const Sidebar = {
  current: null,
  panels: [],

  init() {
    this.host = $("panel-host");
    this.stack = $("panel-stack");
    this.host.style.width = `${Prefs.get("panelWidth", 420)}px`;
    for (const btn of document.querySelectorAll("#sidebar [data-view]")) {
      btn.addEventListener("click", () => this.toggle(btn.dataset.view));
    }
    $("panel-close").addEventListener("click", () => this.hide());
    $("panel-reload").addEventListener("click", () =>
      this.currentPanelBrowser()?.reload()
    );
    $("panel-popout").addEventListener("click", () => {
      const b = this.currentPanelBrowser();
      if (b?.currentURI) {
        Tabs.open(b.currentURI.spec);
      }
    });
    $("panel-add").addEventListener("click", () => {
      this.show("settings");
      Settings.focusPanelForm();
    });
    this.initResizer();
    this.panels = Prefs.get("panels", DEFAULT_PANELS);
    this.renderPanelButtons();
  },

  initResizer() {
    const handle = $("panel-resizer");
    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = this.host.getBoundingClientRect().width;
      handle.toggleAttribute("dragging", true);
      const move = ev => {
        const w = Math.min(900, Math.max(280, startW + ev.clientX - startX));
        this.host.style.width = `${w}px`;
      };
      const up = () => {
        handle.removeAttribute("dragging");
        window.removeEventListener("mousemove", move, true);
        window.removeEventListener("mouseup", up, true);
        Prefs.set(
          "panelWidth",
          Math.round(this.host.getBoundingClientRect().width)
        );
      };
      window.addEventListener("mousemove", move, true);
      window.addEventListener("mouseup", up, true);
    });
  },

  renderPanelButtons() {
    $("sidebar-panels").replaceChildren(
      ...this.panels.map(p => {
        const btn = el(
          "button",
          {
            class: "sidebar-btn",
            title: p.name,
            onclick: () => this.toggle(`panel:${p.id}`),
          },
          siteIcon(p.url, [`https://${hostOf(p.url)}/favicon.ico`])
        );
        btn.dataset.view = `panel:${p.id}`;
        return btn;
      })
    );
    this.updateActive();
  },

  savePanels() {
    Prefs.set("panels", this.panels);
    for (const b of this.stack.querySelectorAll("browser")) {
      if (!this.panels.some(p => `panel:${p.id}` == b.dataset.view)) {
        if (this.current == b.dataset.view) {
          this.hide();
        }
        b.remove();
      }
    }
    this.renderPanelButtons();
  },

  addPanel(name, url) {
    if (!/^[a-z]+:/i.test(url)) {
      url = `https://${url}`;
    }
    const id = `p${Date.now().toString(36)}`;
    this.panels.push({ id, name: name || hostOf(url), url });
    this.savePanels();
    this.show(`panel:${id}`);
  },

  removePanel(id) {
    this.panels = this.panels.filter(p => p.id != id);
    this.savePanels();
  },

  toggle(view) {
    Sound.play("click");
    if (this.current == view) {
      this.hide();
    } else {
      this.show(view);
    }
  },

  show(view) {
    this.current = view;
    this.host.hidden = false;
    let title = VIEW_TITLES[view];
    const isPanel = view.startsWith("panel:");
    if (isPanel) {
      const panel = this.panels.find(p => `panel:${p.id}` == view);
      if (!panel) {
        this.hide();
        return;
      }
      title = panel.name;
      if (!this.stack.querySelector(`browser[data-view="${view}"]`)) {
        this.createPanelBrowser(panel, view);
      }
    }
    for (const child of this.stack.children) {
      child.classList.toggle("active", child.dataset.view == view);
    }
    $("panel-title").textContent = title;
    $("panel-popout").hidden = !isPanel;
    $("panel-reload").hidden = !isPanel;
    this.updateActive();
    PopupNotifications.render();
    ({
      control: Control,
      history: HistoryView,
      bookmarks: BookmarksView,
      downloads: DownloadsView,
      reading: ReadingList,
      passwords: PasswordsView,
      settings: Settings,
    })[view]?.show();
  },

  hide() {
    this.current = null;
    this.host.hidden = true;
    this.updateActive();
    PopupNotifications.render();
  },

  updateActive() {
    for (const btn of document.querySelectorAll("#sidebar [data-view]")) {
      btn.toggleAttribute("active", btn.dataset.view == this.current);
    }
  },

  currentPanelBrowser() {
    return this.current?.startsWith("panel:")
      ? this.stack.querySelector(`browser[data-view="${this.current}"]`)
      : null;
  },

  createPanelBrowser(panel, view) {
    const b = document.createXULElement("browser");
    const attrs = {
      type: "content",
      remote: "true",
      maychangeremoteness: "true",
      messagemanagergroup: "browsers",
      nodefaultsrc: "true",
    };
    for (const [key, value] of Object.entries(attrs)) {
      b.setAttribute(key, value);
    }
    b.dataset.view = view;
    b.classList.add("view");
    this.stack.append(b);
    b.fixupAndLoadURIString(panel.url, {
      triggeringPrincipal: SYSTEM_PRINCIPAL,
    });
    return b;
  },
};

function listItem({ url, title, sub, onRemove, removeIcon = "close" }) {
  const row = el(
    "div",
    {
      class: "item",
      title: url,
      onclick: e => {
        if (e.target.closest(".icon-btn")) {
          return;
        }
        Tabs.load(Tabs.selected, url);
      },
      onauxclick: e => {
        if (e.button == 1) {
          Tabs.open(url, { background: true, afterCurrent: true });
        }
      },
    },
    siteIcon(url, null, "fallback"),
    el(
      "span",
      { class: "text" },
      el("span", {}, title || url),
      el("span", { class: "sub" }, sub ?? hostOf(url))
    )
  );
  if (onRemove) {
    row.append(
      el("button", {
        class: "icon-btn",
        title: "Entfernen",
        icon: removeIcon,
        onclick: onRemove,
      })
    );
  }
  return row;
}

const HistoryView = {
  initialized: false,

  show() {
    if (!this.initialized) {
      this.initialized = true;
      let timer = 0;
      $("history-search").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.render(), 120);
      });
      $("history-clear").addEventListener("click", async () => {
        if (
          Services.prompt.confirm(
            window,
            "Verlauf löschen",
            "Den gesamten Verlauf löschen?"
          )
        ) {
          await Modules.PlacesUtils.history.clear();
          this.render();
        }
      });
    }
    this.render();
  },

  async render() {
    const q = $("history-search").value.trim();
    const db = await Modules.PlacesUtils.promiseDBConnection();
    const params = {};
    let filter = "";
    if (q) {
      params.pattern = `%${escapeLike(q)}%`;
      filter =
        "AND (url LIKE :pattern ESCAPE '/' OR title LIKE :pattern ESCAPE '/')";
    }
    const rows = await db.executeCached(
      `SELECT url, title, last_visit_date FROM moz_places
       WHERE hidden = 0 AND last_visit_date NOT NULL ${filter}
       ORDER BY last_visit_date DESC LIMIT 200`,
      params
    );
    const list = $("history-list");
    list.replaceChildren();
    if (!rows.length) {
      list.append(
        el(
          "div",
          { class: "empty" },
          q ? "Keine Treffer." : "Noch kein Verlauf."
        )
      );
      return;
    }
    const today = new Date().setHours(0, 0, 0, 0);
    let lastGroup = "";
    for (const r of rows) {
      const date = new Date(r.getResultByName("last_visit_date") / 1000);
      const day = new Date(date).setHours(0, 0, 0, 0);
      let group = date.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      if (day == today) {
        group = "Heute";
      } else if (day == today - 86400000) {
        group = "Gestern";
      }
      if (group != lastGroup) {
        list.append(el("div", { class: "group" }, group));
        lastGroup = group;
      }
      const url = r.getResultByName("url");
      list.append(
        listItem({
          url,
          title: r.getResultByName("title"),
          sub: `${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · ${hostOf(url)}`,
          removeIcon: "trash",
          onRemove: async () => {
            await Modules.PlacesUtils.history.remove(url);
            this.render();
          },
        })
      );
    }
  },
};

const Bookmarks = {
  init() {
    this.types = [
      "bookmark-added",
      "bookmark-removed",
      "bookmark-title-changed",
      "bookmark-url-changed",
      "bookmark-moved",
    ];
    this.listener = () => this.refresh();
    PlacesObservers.addListener(this.types, this.listener);
    window.addEventListener("unload", () =>
      PlacesObservers.removeListener(this.types, this.listener)
    );
    this.refresh();
  },

  async refresh() {
    await this.renderBar();
    if (Sidebar.current == "bookmarks") {
      BookmarksView.render();
    }
    const tab = Tabs.selected;
    if (tab) {
      this.updateStar(tab.startPage ? "" : tab.pageUrl);
    }
  },

  async renderBar() {
    const bar = $("bookmarksbar");
    if (!Prefs.get("bookmarksBar", true)) {
      bar.replaceChildren();
      return;
    }
    let items = [];
    try {
      const tree = await Modules.PlacesUtils.promiseBookmarksTree(
        Modules.PlacesUtils.bookmarks.toolbarGuid
      );
      items = (tree?.children ?? []).filter(c => c.uri);
    } catch (e) {
      console.error(e);
    }
    bar.replaceChildren(
      ...items.map(b =>
        el(
          "button",
          {
            class: "bm",
            title: b.uri,
            onclick: () => Tabs.load(Tabs.selected, b.uri),
            onauxclick: e =>
              e.button == 1 &&
              Tabs.open(b.uri, { background: true, afterCurrent: true }),
            oncontextmenu: e => {
              e.preventDefault();
              Menu.showAt(
                $("tabContextMenu"),
                [
                  {
                    label: "In neuem Tab öffnen",
                    cmd: () => Tabs.open(b.uri, { afterCurrent: true }),
                  },
                  {
                    label: "Adresse kopieren",
                    cmd: () => copyToClipboard(b.uri),
                  },
                  "-",
                  {
                    label: "Löschen",
                    cmd: () => Modules.PlacesUtils.bookmarks.remove(b.guid),
                  },
                ],
                e
              );
            },
          },
          siteIcon(b.uri, null, "fallback"),
          el("span", {}, b.title || hostOf(b.uri))
        )
      )
    );
  },

  toggleBar() {
    Prefs.set("bookmarksBar", !Prefs.get("bookmarksBar", true));
    this.renderBar();
  },

  async all() {
    const out = [];
    const walk = node => {
      if (node.uri) {
        out.push(node);
      }
      node.children?.forEach(walk);
    };
    walk(
      await Modules.PlacesUtils.promiseBookmarksTree(
        Modules.PlacesUtils.bookmarks.rootGuid
      )
    );
    return out;
  },

  async toggle(tab) {
    const url = tab?.pageUrl;
    if (!url || tab.startPage || url == "about:blank") {
      return;
    }
    try {
      const existing = await Modules.PlacesUtils.bookmarks.fetch({ url });
      if (existing) {
        await Modules.PlacesUtils.bookmarks.remove(existing.guid);
      } else {
        await Modules.PlacesUtils.bookmarks.insert({
          parentGuid: Modules.PlacesUtils.bookmarks.toolbarGuid,
          url,
          title: Tabs.label(tab),
        });
        Sound.play("toggle");
      }
    } catch (e) {
      console.error(e);
    }
  },

  async updateStar(url) {
    let on = false;
    if (url && /^(https?|file):/.test(url)) {
      try {
        on = !!(await Modules.PlacesUtils.bookmarks.fetch({ url }));
      } catch {}
    }
    $("star").toggleAttribute("checked", on);
  },
};

const BookmarksView = {
  initialized: false,

  show() {
    if (!this.initialized) {
      this.initialized = true;
      $("bookmarks-search").addEventListener("input", () => this.render());
    }
    this.render();
  },

  async render() {
    const q = $("bookmarks-search").value.trim().toLowerCase();
    const items = (await Bookmarks.all()).filter(
      b =>
        !q ||
        b.uri.toLowerCase().includes(q) ||
        b.title?.toLowerCase().includes(q)
    );
    const list = $("bookmarks-list");
    list.replaceChildren(
      ...items.map(b =>
        listItem({
          url: b.uri,
          title: b.title,
          removeIcon: "trash",
          onRemove: () => Modules.PlacesUtils.bookmarks.remove(b.guid),
        })
      )
    );
    if (!items.length) {
      list.append(
        el(
          "div",
          { class: "empty" },
          q
            ? "Keine Treffer."
            : "Noch keine Lesezeichen. Mit Strg+D oder dem Stern hinzufügen."
        )
      );
    }
  },
};

const DownloadsView = {
  rows: new Map(),

  async init() {
    $("downloads-clear").addEventListener("click", () =>
      this.list?.removeFinished()
    );
    try {
      this.list = await Modules.Downloads.getList(Modules.Downloads.ALL);
      await this.list.addView({
        onDownloadAdded: d => {
          this.add(d);
          if (this.ready && !d.stopped) {
            Sidebar.show("downloads");
            Sound.play("toggle");
          }
        },
        onDownloadChanged: d => this.update(d),
        onDownloadRemoved: d => {
          this.rows.get(d)?.remove();
          this.rows.delete(d);
          this.summary();
        },
      });
      this.ready = true;
    } catch (e) {
      console.error(e);
    }
    this.summary();
  },

  show() {
    this.summary();
  },

  add(d) {
    const row = el("div", { class: "item dl" });
    this.rows.set(d, row);
    $("downloads-list").prepend(row);
    this.update(d);
  },

  update(d) {
    const row = this.rows.get(d);
    if (!row) {
      return;
    }
    const name = d.target?.path
      ? PathUtils.filename(d.target.path)
      : hostOf(d.source.url);
    let status;
    if (d.succeeded) {
      status = `Fertig · ${formatBytes(d.target.size ?? d.totalBytes)}`;
    } else if (d.error) {
      status = "Fehlgeschlagen";
    } else if (d.canceled) {
      status = "Abgebrochen";
    } else if (d.hasProgress) {
      status = `${formatBytes(d.currentBytes)} von ${formatBytes(d.totalBytes)} · ${d.progress} %`;
    } else {
      status = `${formatBytes(d.currentBytes)} geladen`;
    }
    const buttons = [];
    if (d.succeeded) {
      buttons.push(
        el("button", {
          class: "icon-btn always",
          title: "Öffnen",
          icon: "play",
          onclick: () => d.launch().catch(console.error),
        }),
        el("button", {
          class: "icon-btn always",
          title: "Ordner öffnen",
          icon: "folder",
          onclick: () => d.showContainingDirectory().catch(console.error),
        })
      );
    } else if (d.stopped) {
      buttons.push(
        el("button", {
          class: "icon-btn always",
          title: "Erneut versuchen",
          icon: "retry",
          onclick: () => d.start().catch(console.error),
        })
      );
    } else {
      buttons.push(
        el("button", {
          class: "icon-btn always",
          title: "Abbrechen",
          icon: "close",
          onclick: () => d.cancel(),
        })
      );
    }
    const bar = !d.stopped
      ? el(
          "div",
          { class: "bar" },
          el("span", { style: `width:${d.hasProgress ? d.progress : 30}%` })
        )
      : null;
    row.replaceChildren(
      makeIcon("download"),
      el(
        "span",
        { class: "text" },
        el("span", {}, name),
        el("span", { class: "sub" }, status),
        bar
      ),
      ...buttons
    );
    this.summary();
  },

  summary() {
    const all = [...this.rows.keys()];
    const active = all.filter(d => !d.stopped).length;
    const badge = $("sidebar-dl-badge");
    badge.textContent = active ? String(active) : "";
    badge.hidden = !active;
    let summary = "";
    if (active) {
      summary = `${active} aktiv`;
    } else if (all.length) {
      summary = `${all.length} Downloads`;
    }
    $("downloads-summary").textContent = summary;
    const list = $("downloads-list");
    if (!all.length && !list.querySelector(".empty")) {
      list.append(el("div", { class: "empty" }, "Noch keine Downloads."));
    } else if (all.length) {
      list.querySelector(".empty")?.remove();
    }
  },
};
