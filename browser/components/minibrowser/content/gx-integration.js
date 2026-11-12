/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../../../toolkit/content/globalOverlay.js */
/* import-globals-from minibrowser.js */
/* import-globals-from gx-tabs.js */
/* import-globals-from gx-sidebar.js */
/* import-globals-from gx-control.js */
/* import-globals-from gx-start.js */
/* import-globals-from gx-settings.js */

// The Firefox actors (favicons, link clicks, fullscreen, context menus,
// popups) talk to the browser window through these globals, so we provide
// the parts of that contract Gecko GX needs.

window.gBrowser = {
  get tabs() {
    return Tabs.list;
  },
  get browsers() {
    return Tabs.list.map(t => t.linkedBrowser).filter(Boolean);
  },
  get selectedTab() {
    return Tabs.selected;
  },
  get selectedBrowser() {
    return Tabs.selected?.linkedBrowser ?? null;
  },
  getTabForBrowser(browser) {
    return browser?._gxTab ?? null;
  },
  getBrowserForTab(tab) {
    return tab?.linkedBrowser ?? null;
  },
  setIcon(tab, iconURL) {
    Tabs.setIcon(tab, iconURL);
  },
};

window.openLinkIn = (url, where, params = {}) => {
  const loadParams = {
    triggeringPrincipal: params.triggeringPrincipal,
    referrerInfo: params.referrerInfo,
    policyContainer: params.policyContainer,
    hasValidUserGestureActivation: params.hasValidUserGestureActivation,
  };
  if (where == "current" || where == "save") {
    Tabs.load(Tabs.selected, url, loadParams);
    return;
  }
  Tabs.open(url, {
    ...loadParams,
    afterCurrent: true,
    background: where == "tabshifted",
    remoteType: params.triggeringRemoteType,
  });
};

window.browserDOMWindow = {
  QueryInterface: ChromeUtils.generateQI(["nsIBrowserDOMWindow"]),

  createContentWindow(
    uri,
    openWindowInfo,
    where,
    flags,
    principal,
    policyContainer
  ) {
    return this._open(
      uri,
      openWindowInfo,
      where,
      principal,
      policyContainer,
      true
    );
  },

  openURI(uri, openWindowInfo, where, flags, principal, policyContainer) {
    return this._open(
      uri,
      openWindowInfo,
      where,
      principal,
      policyContainer,
      false
    );
  },

  _open(uri, openWindowInfo, where, principal, policyContainer, skipLoad) {
    const params = {
      triggeringPrincipal: principal ?? SYSTEM_PRINCIPAL,
      policyContainer,
    };
    if (
      where == Ci.nsIBrowserDOMWindow.OPEN_CURRENTWINDOW &&
      Tabs.selected?.linkedBrowser
    ) {
      if (uri && !skipLoad) {
        Tabs.load(Tabs.selected, uri, params);
      }
      return Tabs.selected.linkedBrowser.browsingContext;
    }
    const tab = Tabs.open(null, {
      openWindowInfo,
      skipLoad: true,
      afterCurrent: true,
      background: where == Ci.nsIBrowserDOMWindow.OPEN_NEWTAB_BACKGROUND,
    });
    if (uri && !skipLoad) {
      Tabs.load(tab, uri, params);
    }
    return tab.linkedBrowser.browsingContext;
  },

  createContentWindowInFrame(uri, params, where, flags, name) {
    return this._openInFrame(null, params, where, name);
  },

  openURIInFrame(uri, params, where, flags, name) {
    return this._openInFrame(uri, params, where, name);
  },

  _openInFrame(uri, params, where, name) {
    if (where == Ci.nsIBrowserDOMWindow.OPEN_PRINT_BROWSER) {
      return null;
    }
    const info = params.openWindowInfo;
    const remoteType = info?.isRemote
      ? ChromeUtils.predictRemoteTypeForURI("about:blank", {
          window,
          userContextId: info.originAttributes.userContextId,
          preferredRemoteType: params.openerBrowser?.remoteType,
        })
      : null;
    const tab = Tabs.open(null, {
      openWindowInfo: info,
      name,
      remoteType,
      skipLoad: true,
      afterCurrent: true,
      background: where == Ci.nsIBrowserDOMWindow.OPEN_NEWTAB_BACKGROUND,
    });
    if (uri) {
      Tabs.load(tab, uri, {
        triggeringPrincipal: params.triggeringPrincipal,
        referrerInfo: params.referrerInfo,
        policyContainer: params.policyContainer,
      });
    }
    return tab.linkedBrowser;
  },

  canClose() {
    return true;
  },

  get tabCount() {
    return Tabs.list.length;
  },
};

window.XULBrowserWindow = {
  QueryInterface: ChromeUtils.generateQI(["nsIXULBrowserWindow"]),
  setOverLink(link) {
    Tabs.overLink = link;
    Tabs.setStatus("");
  },
  showTooltip(x, y, text, direction) {
    if (!document.hasFocus()) {
      return;
    }
    const tip = $("remoteBrowserTooltip");
    tip.label = text;
    tip.style.direction = direction;
    tip.openPopupAtScreen(
      x / window.devicePixelRatio,
      y / window.devicePixelRatio,
      false,
      null
    );
  },
  hideTooltip() {
    $("remoteBrowserTooltip").hidePopup();
  },
};

window.PointerlockFsWarning = {
  showFullScreen() {},
  showPointerLock() {},
  close() {},
};

// A trimmed-down port of browser-fullScreenAndPointerLock.js so that videos
// and games can enter DOM fullscreen from content.
window.FullScreen = {
  enterDomFullscreen(browser, actor) {
    if (!document.fullscreenElement) {
      actor.requestOrigin = null;
      return;
    }
    if (browser.hasAttribute("remote")) {
      const [target, inProcessBC] = this._nextRecipient(actor, false);
      if (!target) {
        this._abort(actor);
        return;
      }
      target.waitingForChildEnterFullscreen = true;
      target.sendAsyncMessage("DOMFullscreen:Entered", {
        remoteFrameBC: inProcessBC,
      });
      if (inProcessBC) {
        return;
      }
    }
    if (
      browser != window.gBrowser.selectedBrowser ||
      Services.focus.activeWindow != window
    ) {
      this._abort(actor);
      return;
    }
    document.documentElement.setAttribute("inDOMFullscreen", true);
  },

  cleanupDomFullscreen(actor) {
    let needToWait = false;
    const [target, inProcessBC] = this._nextRecipient(actor, true);
    if (target) {
      needToWait = true;
      target.waitingForChildExitFullscreen = true;
      target.sendAsyncMessage("DOMFullscreen:CleanUp", {
        remoteFrameBC: inProcessBC,
      });
      if (inProcessBC) {
        return needToWait;
      }
    }
    document.documentElement.removeAttribute("inDOMFullscreen");
    return needToWait;
  },

  exitDomFullScreen() {
    if (document.fullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  },

  _abort(actor) {
    setTimeout(() => document.exitFullscreen().catch(() => {}), 0);
    if (actor.timerId) {
      try {
        Glean.fullscreen.change.cancel(actor.timerId);
      } catch {}
      actor.timerId = null;
    }
  },

  _nextRecipient(actor, useCache) {
    if (useCache && actor.nextMsgRecipient) {
      let next = actor.nextMsgRecipient;
      while (next) {
        const [a] = next;
        if (
          !a.hasBeenDestroyed() &&
          a.windowContext &&
          !a.windowContext.isInBFCache
        ) {
          return next;
        }
        next = a.nextMsgRecipient;
      }
    }
    if (actor.hasBeenDestroyed()) {
      return [null, null];
    }
    let childBC = actor.browsingContext;
    let parentBC = childBC.parent;
    while (parentBC) {
      if (!childBC.currentWindowGlobal || !parentBC.currentWindowGlobal) {
        break;
      }
      if (
        childBC.currentWindowGlobal.osPid != parentBC.currentWindowGlobal.osPid
      ) {
        break;
      }
      childBC = parentBC;
      parentBC = childBC.parent;
    }
    let target = null;
    let inProcessBC = null;
    if (parentBC?.currentWindowGlobal) {
      target = parentBC.currentWindowGlobal.getActor("DOMFullscreen");
      inProcessBC = childBC;
      actor.nextMsgRecipient = [target, inProcessBC];
    } else {
      target = actor.requestOrigin;
    }
    if (
      !target ||
      target.hasBeenDestroyed() ||
      target.windowContext?.isInBFCache
    ) {
      return [null, null];
    }
    return [target, inProcessBC];
  },
};

const ContextMenu = {
  init() {
    window.nsContextMenu = { contentData: null };
    this.popup = $("contentAreaContextMenu");
    this.popup.addEventListener("popupshowing", e => {
      if (e.target == this.popup) {
        this.build();
      }
    });
    this.popup.addEventListener("popuphiding", e => {
      if (e.target != this.popup) {
        return;
      }
      try {
        window.nsContextMenu.contentData?.actor?.hiding();
      } catch {}
      window.nsContextMenu.contentData = null;
    });
  },

  build() {
    const data = window.nsContextMenu.contentData;
    if (!data) {
      return;
    }
    const { context, browser } = data;
    const selection = data.selectionInfo?.fullText?.trim() ?? "";
    const short =
      selection.length > 24 ? `${selection.slice(0, 24)}…` : selection;
    const openTab = (url, background) =>
      Tabs.open(url, {
        afterCurrent: true,
        background,
        triggeringPrincipal: data.principal,
        referrerInfo: data.referrerInfo,
      });
    const items = [];

    if (context.onLink) {
      items.push(
        {
          label: "Link in neuem Tab öffnen",
          cmd: () => openTab(context.linkURL, true),
        },
        {
          label: "Link in neuem Tab anzeigen",
          cmd: () => openTab(context.linkURL, false),
        },
        {
          label: "Link-Adresse kopieren",
          cmd: () => copyToClipboard(context.linkURL),
        },
        "-"
      );
    }
    if (context.onImage) {
      items.push(
        {
          label: "Grafik in neuem Tab öffnen",
          cmd: () => openTab(context.mediaURL, false),
        },
        {
          label: "Grafikadresse kopieren",
          cmd: () => copyToClipboard(context.mediaURL),
        },
        "-"
      );
    }
    if (context.onVideo || context.onAudio) {
      items.push(
        {
          label: "Medienadresse kopieren",
          cmd: () => copyToClipboard(context.mediaURL),
        },
        "-"
      );
    }
    if (context.onEditable || context.onTextInput) {
      items.push(
        { label: "Ausschneiden", cmd: () => goDoCommand("cmd_cut") },
        { label: "Kopieren", cmd: () => goDoCommand("cmd_copy") },
        { label: "Einfügen", cmd: () => goDoCommand("cmd_paste") },
        { label: "Alles auswählen", cmd: () => goDoCommand("cmd_selectAll") },
        "-"
      );
    } else if (selection) {
      items.push(
        { label: "Kopieren", cmd: () => copyToClipboard(selection) },
        "-"
      );
    }
    if (selection) {
      items.push(
        {
          label: `Mit ${Search.name} nach „${short}“ suchen`,
          cmd: async () => openTab(await Search.url(selection), false),
        },
        "-"
      );
    }
    if (
      !context.onLink &&
      !context.onImage &&
      !selection &&
      !context.onEditable &&
      !context.onTextInput
    ) {
      items.push(
        {
          label: "Zurück",
          disabled: !browser.canGoBack,
          cmd: () => browser.goBack(),
        },
        {
          label: "Vor",
          disabled: !browser.canGoForward,
          cmd: () => browser.goForward(),
        },
        { label: "Neu laden", cmd: () => browser.reload() },
        "-",
        {
          label: "Lesezeichen für diese Seite",
          cmd: () =>
            Bookmarks.toggle(
              window.gBrowser.getTabForBrowser(browser) ?? Tabs.selected
            ),
        },
        {
          label: "Seitenadresse kopieren",
          cmd: () => copyToClipboard(data.docLocation),
        },
        { label: "Alles auswählen", cmd: () => goDoCommand("cmd_selectAll") },
        "-",
        {
          label: "Seitenquelltext anzeigen",
          cmd: () =>
            Tabs.open(`view-source:${data.docLocation}`, {
              afterCurrent: true,
            }),
        }
      );
    }
    Menu.fill(this.popup, items);
  },
};

const Integration = {
  init() {
    ContextMenu.init();
  },
};
