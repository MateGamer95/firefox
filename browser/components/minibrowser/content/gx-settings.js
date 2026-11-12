/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from minibrowser.js */
/* import-globals-from gx-tabs.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */

const ACCENTS = [
  ["Gecko Rot", "#fa1e4e"],
  ["Ultraviolett", "#8b5cf6"],
  ["Cyber Cyan", "#00d9ff"],
  ["Toxic", "#3dff6e"],
  ["Sunset", "#ff7a1a"],
  ["Neon Pink", "#ff2fb3"],
  ["Gold", "#ffc531"],
];

const BACKDROPS = [
  ["Nacht", "#0e0d13"],
  ["Tiefsee", "#0a1020"],
  ["Kohle", "#161616"],
  ["Purpur", "#140b1d"],
  ["Wald", "#0b1410"],
];

const WALLPAPERS = [
  ["glow", "Glühen"],
  ["grid", "Raster"],
  ["synth", "Synthwave"],
  ["plain", "Schlicht"],
];

const Theme = {
  apply() {
    const root = document.documentElement;
    root.style.setProperty("--accent", Prefs.get("accent", ACCENTS[0][1]));
    root.style.setProperty("--bg", Prefs.get("backdrop", BACKDROPS[0][1]));
    root.dataset.wallpaper = Prefs.get("wallpaper", "glow");
    if (Sidebar.current == "control") {
      Control.render();
    }
  },
};

const Settings = {
  show() {
    this.render();
  },

  focusPanelForm() {
    setTimeout(() => {
      const input = $("panel-name");
      input?.scrollIntoView({ block: "center" });
      input?.focus();
    }, 0);
  },

  section(title, ...children) {
    return el(
      "div",
      { class: "settings-section" },
      el("h3", {}, title),
      ...children
    );
  },

  toggle(label, sub, pref, fallback, onChange) {
    const input = el("input", { type: "checkbox", class: "switch" });
    input.checked = Prefs.get(pref, fallback);
    input.addEventListener("change", () => {
      Prefs.set(pref, input.checked);
      Sound.play("toggle");
      onChange?.(input.checked);
    });
    return el(
      "label",
      { class: "switch-row" },
      el("span", {}, el("b", {}, label), sub ? el("small", {}, sub) : null),
      input
    );
  },

  swatches(items, pref, fallback, wide = false) {
    const current = Prefs.get(pref, fallback);
    return items.map(([name, color]) => {
      const sw = el("button", {
        class: `swatch${wide ? " wide" : ""}`,
        title: name,
        style: `background:${color}`,
        onclick: () => {
          Prefs.set(pref, color);
          Theme.apply();
          Sound.play("click");
          this.render();
        },
      });
      sw.toggleAttribute(
        "selected",
        current.toLowerCase() == color.toLowerCase()
      );
      return sw;
    });
  },

  async render() {
    const root = $("settings");
    const accent = Prefs.get("accent", ACCENTS[0][1]);
    const custom = el("input", {
      type: "color",
      value: accent,
      title: "Eigene Farbe",
    });
    custom.addEventListener("input", () => {
      Prefs.set("accent", custom.value);
      Theme.apply();
    });

    const wallpaper = Prefs.get("wallpaper", "glow");
    const wallpapers = WALLPAPERS.map(([id, name]) => {
      const btn = el(
        "button",
        {
          class: "text-btn",
          onclick: () => {
            Prefs.set("wallpaper", id);
            Theme.apply();
            Sound.play("click");
            this.render();
          },
        },
        name
      );
      if (id == wallpaper) {
        btn.style.borderColor = "var(--accent)";
        btn.style.color = "var(--accent)";
      }
      return btn;
    });

    await Search.ready;
    const engineSelect = el("select");
    try {
      const engines = await Modules.SearchService.getVisibleEngines();
      const current = await Modules.SearchService.getDefault();
      for (const engine of engines) {
        const opt = el("option", { value: engine.name }, engine.name);
        opt.selected = engine.name == current.name;
        engineSelect.append(opt);
      }
      engineSelect.addEventListener("change", async () => {
        const engine = Modules.SearchService.getEngineByName(
          engineSelect.value
        );
        await Modules.SearchService.setDefault(
          engine,
          Modules.SearchService.CHANGE_REASON.USER
        );
      });
    } catch (e) {
      console.error(e);
    }

    const home = el("input", {
      type: "text",
      placeholder: "Leer = Speed Dial",
      value: Prefs.get("homepage", ""),
    });
    home.addEventListener("change", () =>
      Prefs.set("homepage", home.value.trim())
    );

    const panelName = el("input", {
      type: "text",
      id: "panel-name",
      placeholder: "Name",
    });
    const panelUrl = el("input", { type: "text", placeholder: "https://…" });
    const addPanel = el(
      "button",
      {
        class: "accent-btn",
        onclick: () => {
          if (panelUrl.value.trim()) {
            Sidebar.addPanel(panelName.value.trim(), panelUrl.value.trim());
          }
        },
      },
      "Hinzufügen"
    );
    const panelList = Sidebar.panels.map(p =>
      listItem({
        url: p.url,
        title: p.name,
        onRemove: () => {
          Sidebar.removePanel(p.id);
          this.render();
        },
      })
    );

    root.replaceChildren(
      this.section(
        "Akzentfarbe",
        el(
          "div",
          { class: "swatches" },
          ...this.swatches(ACCENTS, "accent", ACCENTS[0][1]),
          custom
        )
      ),
      this.section(
        "Hintergrund",
        el(
          "div",
          { class: "swatches" },
          ...this.swatches(BACKDROPS, "backdrop", BACKDROPS[0][1], true)
        )
      ),
      this.section(
        "Startseite",
        el("div", { class: "swatches" }, ...wallpapers),
        el("div", { class: "settings-row" }, home)
      ),
      this.section(
        "Verhalten",
        this.toggle(
          "GX-Sounds",
          "Kurze Klänge beim Öffnen und Schließen von Tabs.",
          "sounds",
          true
        ),
        this.toggle(
          "Lesezeichenleiste",
          "Strg+Umschalt+B",
          "bookmarksBar",
          true,
          () => Bookmarks.renderBar()
        ),
        this.toggle(
          "Sitzung wiederherstellen",
          "Öffnet beim Start die Tabs der letzten Sitzung.",
          "restoreSession",
          true
        )
      ),
      this.section("Suchmaschine", engineSelect),
      this.section(
        "Web-Panels",
        ...panelList,
        el("div", { class: "settings-row" }, panelName, panelUrl, addPanel)
      ),
      this.section(
        "Speed Dial",
        el(
          "button",
          { class: "text-btn", onclick: () => Start.reset() },
          "Kacheln zurücksetzen"
        )
      ),
      this.section(
        "Über Gecko GX",
        el(
          "div",
          { class: "muted" },
          `Gecko ${Services.appinfo.platformVersion} · ${Services.appinfo.OS} · ${Services.appinfo.XPCOMABI}`
        )
      )
    );
  },
};
