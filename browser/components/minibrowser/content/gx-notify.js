/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from minibrowser.js */
/* import-globals-from gx-tabs.js */
/* import-globals-from gx-integration.js */
/* import-globals-from gx-shields.js */
/* import-globals-from gx-tools.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

// Gecko's permission, password and WebRTC prompts talk to
// window.PopupNotifications. This is a compact implementation of the parts of
// that API they use, rendered as cards over the content area.

const WEBRTC_PERMISSIONS = {
  "webRTC-shareDevices-notification-icon": ["camera", "microphone"],
  "webRTC-shareMicrophone-notification-icon": ["microphone"],
  "webRTC-shareSpeaker-notification-icon": ["speaker"],
};

const PERMISSION_LABELS = {
  camera: "Kamera",
  microphone: "Mikrofon",
  speaker: "Lautsprecher",
};

/**
 * One pending request shown by PopupNotifications.
 */
class GXNotification {
  constructor(
    owner,
    browser,
    id,
    message,
    anchorID,
    mainAction,
    secondaryActions,
    options
  ) {
    this.owner = owner;
    this.browser = browser;
    this.id = id;
    this.message = message;
    this.anchorID = anchorID;
    this.mainAction = mainAction;
    this.secondaryActions = secondaryActions ?? [];
    this.options = options ?? {};
    this.dismissed = !!this.options.dismissed;
    this.timeCreated = Date.now();
  }

  remove() {
    this.owner.remove(this);
  }
}

const PopupNotifications = {
  list: [],
  panel: null,
  isPanelOpen: false,

  init() {
    this.panel = $("notification-popup");
    $("notif-anchor").addEventListener("click", () => {
      for (const n of this.list) {
        if (this.isVisible(n.browser)) {
          n.dismissed = false;
          n.shown = false;
        }
      }
      this.render();
    });
  },

  show(browser, id, message, anchorID, mainAction, secondaryActions, options) {
    const existing = this.getNotification(id, browser);
    if (existing) {
      this.remove(existing);
    }
    const n = new GXNotification(
      this,
      browser,
      id,
      message,
      anchorID,
      mainAction,
      secondaryActions,
      options
    );
    this.list.push(n);
    this.render();
    if (!n.dismissed && this.isVisible(browser)) {
      Sound.play("toggle");
    }
    return n;
  },

  getNotification(id, browser) {
    return (
      this.list.find(n => n.id == id && (!browser || n.browser == browser)) ??
      null
    );
  },

  remove(notifications) {
    for (const n of [].concat(notifications)) {
      const i = this.list.indexOf(n);
      if (i < 0) {
        continue;
      }
      this.list.splice(i, 1);
      this.fire(n, "removed");
    }
    this.render();
  },

  fire(n, topic) {
    try {
      return n.options.eventCallback?.call(n, topic);
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  locationChange(browser) {
    for (const n of [...this.list]) {
      if (n.browser != browser) {
        continue;
      }
      if (n.options.persistence > 0) {
        n.options.persistence--;
      } else if (!(n.options.timeout > Date.now())) {
        this.remove(n);
      }
    }
  },

  isVisible(browser) {
    return (
      browser == Tabs.selected?.linkedBrowser ||
      browser == Sidebar.currentPanelBrowser()
    );
  },

  render() {
    if (!this.panel) {
      return;
    }
    for (const n of [...this.list]) {
      if (!n.browser?.isConnected) {
        this.list.splice(this.list.indexOf(n), 1);
        this.fire(n, "removed");
      }
    }
    const visible = this.list.filter(n => this.isVisible(n.browser));
    const active = visible.filter(n => !n.dismissed);
    $("notif-anchor").hidden = !visible.some(n => n.dismissed);
    this.panel.replaceChildren(
      ...active.map(n => (n.card ??= this.buildCard(n)))
    );
    this.panel.hidden = !active.length;
    for (const n of active) {
      if (!n.shown) {
        n.shown = true;
        if (!n.id.startsWith("webRTC")) {
          this.fire(n, "showing");
          this.fire(n, "shown");
        }
      }
    }
  },

  dismiss(n) {
    n.dismissed = true;
    this.fire(n, "dismissed");
    this.render();
  },

  act(n, action, checkbox) {
    try {
      action?.callback?.({
        checkboxChecked: !!checkbox?.checked,
        source: "button",
      });
    } catch (e) {
      console.error(e);
    }
    if (action?.dismiss) {
      this.dismiss(n);
    } else if (this.list.includes(n)) {
      this.remove(n);
    }
  },

  hostOf(n) {
    return (
      n.options.name ||
      hostOf(n.browser.currentURI?.spec ?? "") ||
      "Diese Seite"
    );
  },

  buildCard(n) {
    const card = el("div", { class: "notif-card" });
    card.notification = n;
    card.append(
      el("button", {
        class: "icon-btn notif-close",
        title: "Später",
        icon: "close",
        onclick: () => this.dismiss(n),
      })
    );
    if (n.id.startsWith("webRTC")) {
      return this.buildWebRTCCard(n, card);
    }
    const text =
      typeof n.message == "string" ? n.message : (n.message?.textContent ?? "");
    const parts = text.split("<>");
    card.append(
      el(
        "div",
        { class: "notif-msg" },
        parts[0],
        parts.length > 1 ? el("b", {}, this.hostOf(n)) : null,
        parts.slice(1).join(this.hostOf(n))
      )
    );
    if (n.options.hintText) {
      card.append(el("div", { class: "notif-hint" }, n.options.hintText));
    }
    if (n.id == "password") {
      const password = el("input", {
        type: "password",
        id: "password-notification-password",
        placeholder: "Passwort",
      });
      password.inputEl = password;
      card.append(
        el("input", {
          type: "text",
          id: "password-notification-username",
          placeholder: "Benutzername",
        }),
        password
      );
    }
    let checkbox = null;
    if (n.options.checkbox) {
      checkbox = el("input", { type: "checkbox" });
      checkbox.checked = !!n.options.checkbox.checked;
      card.append(
        el(
          "label",
          { class: "notif-check" },
          checkbox,
          n.options.checkbox.label
        )
      );
    }
    const buttons = el("div", { class: "notif-buttons" });
    for (const action of n.secondaryActions) {
      buttons.append(
        el(
          "button",
          { class: "text-btn", onclick: () => this.act(n, action, checkbox) },
          action.label
        )
      );
    }
    if (n.mainAction) {
      buttons.append(
        el(
          "button",
          {
            class: "accent-btn notif-main",
            onclick: () => this.act(n, n.mainAction, checkbox),
          },
          n.mainAction.label
        )
      );
    }
    card.append(buttons);
    new MutationObserver(() => {
      const main = card.querySelector(".notif-main");
      if (main && card.hasAttribute("buttonlabel")) {
        main.textContent = card.getAttribute("buttonlabel");
      }
      if (main) {
        main.disabled = card.hasAttribute("mainactiondisabled");
      }
    }).observe(card, { attributes: true });
    return card;
  },

  buildWebRTCCard(n, card) {
    const host = this.hostOf(n);
    const deny = n.secondaryActions[0];
    const permissions = WEBRTC_PERMISSIONS[n.anchorID];
    if (!permissions) {
      card.append(
        el(
          "div",
          { class: "notif-msg" },
          el("b", {}, host),
          " möchte deinen Bildschirm teilen. Das unterstützt Gecko GX noch nicht."
        ),
        el(
          "div",
          { class: "notif-buttons" },
          el(
            "button",
            { class: "accent-btn", onclick: () => this.act(n, deny) },
            "OK"
          )
        )
      );
      return card;
    }
    const what = permissions.map(p => PERMISSION_LABELS[p]).join(" und ");
    const remember = el("input", { type: "checkbox" });
    card.append(
      el(
        "div",
        { class: "notif-msg" },
        el("b", {}, host),
        ` möchte auf ${what} zugreifen.`
      ),
      el("label", { class: "notif-check" }, remember, "Entscheidung merken"),
      el(
        "div",
        { class: "notif-buttons" },
        el(
          "button",
          { class: "text-btn", onclick: () => this.act(n, deny) },
          "Blockieren"
        ),
        el(
          "button",
          {
            class: "accent-btn",
            onclick: () => this.allowWebRTC(n, permissions, remember.checked),
          },
          "Erlauben"
        )
      )
    );
    return card;
  },

  allowWebRTC(n, permissions, remember) {
    const principal = n.browser.contentPrincipal;
    for (const permission of permissions) {
      Services.perms.addFromPrincipal(
        principal,
        permission,
        Services.perms.ALLOW_ACTION,
        remember ? Services.perms.EXPIRE_NEVER : Services.perms.EXPIRE_SESSION
      );
    }
    // With the permission stored, WebRTCParent grants the pending request
    // when its notification is shown.
    this.fire(n, "showing");
    if (this.list.includes(n)) {
      this.remove(n);
    }
  },
};

window.PopupNotifications = PopupNotifications;
