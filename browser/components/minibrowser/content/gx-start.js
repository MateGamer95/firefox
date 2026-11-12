/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from minibrowser.js */
/* import-globals-from gx-tabs.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-settings.js */

const DEFAULT_TILES = [
  { name: "YouTube", url: "https://www.youtube.com/" },
  { name: "Twitch", url: "https://www.twitch.tv/" },
  { name: "Reddit", url: "https://www.reddit.com/" },
  { name: "Steam", url: "https://store.steampowered.com/" },
  { name: "Epic Games", url: "https://store.epicgames.com/" },
  { name: "Discord", url: "https://discord.com/app" },
  { name: "GitHub", url: "https://github.com/" },
  { name: "Wikipedia", url: "https://de.wikipedia.org/" },
];

const Start = {
  init() {
    this.tiles = Prefs.get("speeddial", DEFAULT_TILES);
    $("start-form").addEventListener("submit", e => {
      e.preventDefault();
      const q = $("start-search").value.trim();
      if (q) {
        $("start-search").value = "";
        Tabs.load(Tabs.selected, q);
      }
    });
    $("tile-editor").addEventListener("submit", e => {
      e.preventDefault();
      let url = $("tile-url").value.trim();
      if (!/^[a-z]+:/i.test(url)) {
        url = `https://${url}`;
      }
      this.tiles.push({
        name: $("tile-name").value.trim() || hostOf(url),
        url,
      });
      this.save();
      this.closeEditor();
    });
    $("tile-cancel").addEventListener("click", () => this.closeEditor());
    this.render();
    this.updateClock();
    setInterval(() => this.updateClock(), 5000);
  },

  save() {
    Prefs.set("speeddial", this.tiles);
    this.render();
  },

  reset() {
    this.tiles = structuredClone(DEFAULT_TILES);
    this.save();
  },

  render() {
    const tiles = this.tiles.map((t, i) => {
      const host = hostOf(t.url);
      return el(
        "button",
        {
          class: "tile",
          title: t.url,
          onclick: e => {
            if (e.target.closest(".icon-btn")) {
              return;
            }
            Sound.play("click");
            Tabs.load(Tabs.selected, t.url);
          },
          onauxclick: e =>
            e.button == 1 &&
            Tabs.open(t.url, { background: true, afterCurrent: true }),
        },
        siteIcon(t.url, [
          `https://${host}/apple-touch-icon.png`,
          `https://${host}/favicon.ico`,
        ]),
        el("span", { class: "name" }, t.name),
        el("span", {
          class: "icon-btn",
          title: "Entfernen",
          icon: "close",
          onclick: () => {
            this.tiles.splice(i, 1);
            this.save();
          },
        })
      );
    });
    const add = el(
      "button",
      {
        class: "tile add",
        title: "Kachel hinzufügen",
        onclick: () => this.openEditor(),
      },
      makeIcon("plus"),
      el("span", { class: "name" }, "Hinzufügen")
    );
    $("tiles").replaceChildren(...tiles, add);
  },

  openEditor() {
    $("tile-name").value = "";
    $("tile-url").value = "";
    $("tile-editor").hidden = false;
    $("tile-name").focus();
  },

  closeEditor() {
    $("tile-editor").hidden = true;
  },

  focusSearch() {
    setTimeout(() => $("start-search").focus(), 0);
  },

  updateClock() {
    const now = new Date();
    $("start-clock").textContent = now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    $("start-date").textContent = now.toLocaleDateString("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  },

  updateWidgets() {
    $("w-blocked").textContent =
      Control.totalBlocked?.toLocaleString("de-DE") ?? "0";
    $("w-ram").textContent = Control.mem ? formatBytes(Control.mem) : "–";
    $("w-tabs").textContent = String(Tabs.list.length);
  },
};
