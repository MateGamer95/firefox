/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from minibrowser.js */
/* import-globals-from gx-tabs.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-notify.js */
/* import-globals-from gx-tools.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

// Brave-style estimates for the start page stats.
const SECONDS_SAVED_PER_BLOCK = 0.05;
const BYTES_SAVED_PER_BLOCK = 25 * 1024;

const Shields = {
  init() {
    this.engine = Modules.GXShields;
    this.engine.init();
    this.popup = $("shields-popup");
    this.listener = browser => {
      const tab = browser._gxTab;
      if (!tab) {
        return;
      }
      tab.adsBlocked = (tab.adsBlocked ?? 0) + 1;
      if (tab == Tabs.selected) {
        Toolbar.updateShield(tab);
        if (!this.popup.hidden) {
          this.render();
        }
      }
    };
    this.engine.addListener(this.listener);
    window.addEventListener("unload", () =>
      this.engine.removeListener(this.listener)
    );
    $("shield").addEventListener("click", () => this.toggle());
    document.addEventListener("mousedown", e => {
      if (
        !this.popup.hidden &&
        !this.popup.contains(e.target) &&
        !$("shield").contains(e.target)
      ) {
        this.hide();
      }
    });
  },

  host(tab) {
    return tab && !tab.startPage && /^https?:/.test(tab.pageUrl)
      ? hostOf(tab.pageUrl)
      : "";
  },

  count(tab) {
    return (tab?.adsBlocked ?? 0) + (tab?.blocked ?? 0);
  },

  totalBlocked() {
    return (Control.totalBlocked ?? 0) + (this.engine?.stats.requests ?? 0);
  },

  isOn(tab) {
    const host = this.host(tab);
    return !host || this.engine.isEnabledFor(host);
  },

  toggle() {
    if (this.popup.hidden) {
      this.show();
    } else {
      this.hide();
    }
  },

  show() {
    const rect = $("shield").getBoundingClientRect();
    this.popup.style.top = `${rect.bottom + 6}px`;
    this.popup.style.right = `${window.innerWidth - rect.right}px`;
    this.render();
    this.popup.hidden = false;
    Sound.play("click");
  },

  hide() {
    this.popup.hidden = true;
  },

  globalToggle(label, sub, read, write) {
    const input = el("input", { type: "checkbox", class: "switch" });
    input.checked = read();
    input.addEventListener("change", () => {
      write(input.checked);
      Sound.play("toggle");
    });
    return el(
      "label",
      { class: "switch-row" },
      el("span", {}, el("b", {}, label), sub ? el("small", {}, sub) : null),
      input
    );
  },

  render() {
    const tab = Tabs.selected;
    const host = this.host(tab);
    const on = this.isOn(tab);
    const siteSwitch = el("input", { type: "checkbox", class: "switch big" });
    siteSwitch.checked = on;
    siteSwitch.disabled = !host;
    siteSwitch.addEventListener("change", () => {
      this.engine.setEnabledFor(host, siteSwitch.checked);
      Sound.play("toggle");
      tab.adsBlocked = 0;
      tab.linkedBrowser?.reload();
      this.render();
      Toolbar.updateShield(tab);
    });

    const scripts = el("input", { type: "checkbox", class: "switch" });
    scripts.checked = this.scriptsBlocked(host);
    scripts.disabled = !host || !on;
    scripts.addEventListener("change", () => {
      const list = new Set(Prefs.get("noScript", []));
      if (scripts.checked) {
        list.add(host);
      } else {
        list.delete(host);
      }
      Prefs.set("noScript", [...list]);
      this.applyScriptPolicy(tab, true);
      Sound.play("toggle");
    });

    const rules = this.engine.engine.block.size + this.engine.engine.paths.size;
    this.popup.replaceChildren(
      el(
        "div",
        { class: "shields-head" },
        el("span", {
          class: `shields-badge${on ? "" : " off"}`,
          icon: "shield",
        }),
        el(
          "span",
          { class: "shields-site" },
          el("b", {}, host || "Keine Webseite"),
          el(
            "small",
            {},
            on ? "Shields sind AN" : "Shields sind AUS für diese Seite"
          )
        ),
        siteSwitch
      ),
      el(
        "div",
        { class: "shields-count" },
        el("b", {}, String(on ? this.count(tab) : 0)),
        el(
          "span",
          {},
          `Werbung ${tab?.adsBlocked ?? 0} · Tracker ${tab?.blocked ?? 0}`
        )
      ),
      el(
        "label",
        { class: "switch-row" },
        el(
          "span",
          {},
          el("b", {}, "Skripte blockieren"),
          el("small", {}, "Nur für diese Seite. Kann Seiten kaputt machen.")
        ),
        scripts
      ),
      el("div", { class: "shields-sep" }),
      this.globalToggle(
        "Werbung blockieren",
        "EasyList und EasyPrivacy, plus Ausblenden von Werbeflächen.",
        () => Prefs.get("shieldsAds", true),
        v => {
          Prefs.set("shieldsAds", v);
          this.engine.registerCosmeticSheet();
        }
      ),
      this.globalToggle(
        "Cookie-Banner ablehnen",
        "Klickt „Alle ablehnen“ und blendet Consent-Banner aus.",
        () => Prefs.get("shieldsCookies", true),
        v => Prefs.set("shieldsCookies", v)
      ),
      this.globalToggle(
        "HTTPS-Upgrade",
        "Lädt Seiten wenn möglich verschlüsselt.",
        () => Services.prefs.getBoolPref("dom.security.https_first", true),
        v => Services.prefs.setBoolPref("dom.security.https_first", v)
      ),
      this.globalToggle(
        "Fingerprinting-Schutz",
        "Erschwert das Wiedererkennen deines Geräts.",
        () =>
          Services.prefs.getBoolPref("privacy.fingerprintingProtection", true),
        v => Services.prefs.setBoolPref("privacy.fingerprintingProtection", v)
      ),
      el(
        "div",
        { class: "shields-foot" },
        el(
          "span",
          { class: "muted" },
          rules
            ? `${rules.toLocaleString("de-DE")} Filterregeln aktiv`
            : "Filterlisten werden geladen …"
        ),
        el(
          "button",
          {
            class: "text-btn",
            onclick: () => {
              this.hide();
              Sidebar.show("control");
            },
          },
          "GX Control"
        )
      )
    );
  },

  scriptsBlocked(host) {
    return !!host && Prefs.get("noScript", []).includes(host);
  },

  /**
   * Applies the per-site script setting to the tab's browsing context.
   *
   * @param {Element} tab
   * @param {boolean} reloadIfChanged  Reload so the new setting takes effect.
   */
  applyScriptPolicy(tab, reloadIfChanged) {
    const b = tab?.linkedBrowser;
    const host = this.host(tab);
    const bc = b?.browsingContext;
    if (!bc || !host) {
      return;
    }
    const allow = !(
      this.scriptsBlocked(host) && this.engine.isEnabledFor(host)
    );
    if (bc.allowJavascript != allow) {
      bc.allowJavascript = allow;
      if (reloadIfChanged) {
        b.reload();
      }
    }
  },
};
