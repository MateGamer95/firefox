/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Gecko GX Shields: a small EasyList/EasyPrivacy engine that blocks ad and
 * tracker requests in the parent process, hides ad slots with a global
 * cosmetic stylesheet and lets a content actor dismiss cookie banners.
 *
 * Only the common rule shapes are supported: `||host^`, `||host/path`,
 * `@@||host^`, `$third-party` and plain `##selector` element hiding.
 */

import { FileUtils } from "resource://gre/modules/FileUtils.sys.mjs";

const LISTS = [
  { id: "easylist", url: "https://easylist.to/easylist/easylist.txt" },
  { id: "easyprivacy", url: "https://easylist.to/easylist/easyprivacy.txt" },
];
const UPDATE_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000;
const PROCEDURAL =
  /:-abp-|:has-text|:xpath|:matches-|:upward|:remove|:style|:watch-attr|:min-text-length|:others/;
const IGNORED_OPTIONS =
  /^(~?(script|image|stylesheet|xmlhttprequest|subdocument|media|font|object|ping|websocket|other)|all|important|match-case)$/;

function parentDomain(host) {
  const i = host.indexOf(".");
  return i < 0 ? "" : host.slice(i + 1);
}

function baseDomain(host) {
  try {
    return Services.eTLD.getBaseDomainFromHost(host);
  } catch {
    return host;
  }
}

/**
 * Parsed filter rules and the matching logic.
 */
class FilterEngine {
  // host -> 1 (always) or 2 (third-party only)
  block = new Map();
  allow = new Set();
  // host -> [{ prefix, thirdParty }]
  paths = new Map();
  genericHide = [];
  // host -> [selector]
  domainHide = new Map();

  addLine(raw) {
    const line = raw.trim();
    if (!line || line[0] == "!" || line[0] == "[") {
      return;
    }
    if (line.includes("#@#") || line.includes("#?#") || line.includes("#$#")) {
      return;
    }
    const hide = line.indexOf("##");
    if (hide >= 0) {
      this.addHideRule(line.slice(0, hide), line.slice(hide + 2));
      return;
    }
    this.addNetworkRule(line);
  }

  addHideRule(domains, selector) {
    if (!selector || selector[0] == "+" || PROCEDURAL.test(selector)) {
      return;
    }
    if (!domains) {
      this.genericHide.push(selector);
      return;
    }
    for (const domain of domains.split(",")) {
      if (!domain || domain[0] == "~" || domain.includes("*")) {
        continue;
      }
      let list = this.domainHide.get(domain);
      if (!list) {
        list = [];
        this.domainHide.set(domain, list);
      }
      list.push(selector);
    }
  }

  addNetworkRule(line) {
    let rule = line;
    const exception = rule.startsWith("@@");
    if (exception) {
      rule = rule.slice(2);
    }
    if (!rule.startsWith("||")) {
      return;
    }
    let thirdParty = false;
    const dollar = rule.indexOf("$");
    if (dollar >= 0) {
      for (const opt of rule.slice(dollar + 1).split(",")) {
        if (opt == "third-party" || opt == "3p") {
          thirdParty = true;
        } else if (!IGNORED_OPTIONS.test(opt)) {
          return;
        }
      }
      rule = rule.slice(0, dollar);
    }
    const match = /^([a-z0-9.-]+)(.*)$/i.exec(rule.slice(2));
    if (!match || !match[1].includes(".")) {
      return;
    }
    const host = match[1].toLowerCase();
    const rest = match[2];
    if (!rest || rest == "^" || rest == "^|" || rest == "/") {
      if (exception) {
        this.allow.add(host);
      } else if (this.block.get(host) != 1) {
        this.block.set(host, thirdParty ? 2 : 1);
      }
      return;
    }
    if (exception || !rest.startsWith("/")) {
      return;
    }
    const prefix = rest.split(/[*^|]/)[0];
    if (prefix.length < 2) {
      return;
    }
    let list = this.paths.get(host);
    if (!list) {
      list = [];
      this.paths.set(host, list);
    }
    list.push({ prefix, thirdParty });
  }

  matches(uri, topHost) {
    const host = uri.asciiHost;
    if (!host) {
      return false;
    }
    for (let h = host; h; h = parentDomain(h)) {
      if (this.allow.has(h)) {
        return false;
      }
    }
    let thirdParty = null;
    const isThirdParty = () =>
      (thirdParty ??= baseDomain(host) != baseDomain(topHost));
    for (let h = host; h; h = parentDomain(h)) {
      const flag = this.block.get(h);
      if (flag == 1 || (flag == 2 && isThirdParty())) {
        return true;
      }
      const prefixes = this.paths.get(h);
      if (prefixes) {
        const path = uri.pathQueryRef;
        for (const p of prefixes) {
          if (path.startsWith(p.prefix) && (!p.thirdParty || isThirdParty())) {
            return true;
          }
        }
      }
    }
    return false;
  }

  domainSelectors(host) {
    const out = [];
    for (let h = host; h; h = parentDomain(h)) {
      const list = this.domainHide.get(h);
      if (list) {
        out.push(...list);
      }
    }
    return out;
  }
}

function readPref(name, fallback) {
  try {
    return JSON.parse(Services.prefs.getStringPref(`geckogx.${name}`));
  } catch {
    return fallback;
  }
}

function writePref(name, value) {
  Services.prefs.setStringPref(`geckogx.${name}`, JSON.stringify(value));
}

export const GXShields = {
  initialized: false,
  engine: new FilterEngine(),
  listeners: new Set(),
  sheetURI: null,
  loading: null,
  stats: { requests: 0 },

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.off = new Set(readPref("shieldsOff", []));
    this.stats.requests = readPref("adsBlockedTotal", 0);
    Services.obs.addObserver(this, "http-on-modify-request");
    try {
      ChromeUtils.registerWindowActor("GXShields", {
        parent: {
          esModuleURI:
            "moz-src:///browser/components/minibrowser/modules/GXShieldsParent.sys.mjs",
        },
        child: {
          esModuleURI:
            "moz-src:///browser/components/minibrowser/modules/GXShieldsChild.sys.mjs",
          events: { DOMContentLoaded: {} },
        },
        matches: ["http://*/*", "https://*/*"],
        allFrames: true,
        messageManagerGroups: ["browsers"],
      });
    } catch (e) {
      console.error(e);
    }
    this.loading = this.loadLists();
  },

  get adsEnabled() {
    return readPref("shieldsAds", true);
  },

  get cookiesEnabled() {
    return readPref("shieldsCookies", true);
  },

  isEnabledFor(host) {
    return !!host && !this.off.has(host);
  },

  setEnabledFor(host, enabled) {
    if (enabled) {
      this.off.delete(host);
    } else {
      this.off.add(host);
    }
    writePref("shieldsOff", [...this.off]);
    for (const scheme of ["https", "http"]) {
      const principal =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(
          `${scheme}://${host}`
        );
      if (enabled) {
        Services.perms.removeFromPrincipal(principal, "trackingprotection");
      } else {
        Services.perms.addFromPrincipal(
          principal,
          "trackingprotection",
          Services.perms.ALLOW_ACTION
        );
      }
    }
    this.registerCosmeticSheet();
  },

  addListener(fn) {
    this.listeners.add(fn);
  },

  removeListener(fn) {
    this.listeners.delete(fn);
  },

  async loadLists() {
    const dir = PathUtils.join(PathUtils.profileDir, "geckogx-filters");
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    const engine = new FilterEngine();
    for (const list of LISTS) {
      const file = PathUtils.join(dir, `${list.id}.txt`);
      let text = null;
      let stale = true;
      try {
        const info = await IOUtils.stat(file);
        stale = Date.now() - info.lastModified > UPDATE_INTERVAL_MS;
        text = await IOUtils.readUTF8(file);
      } catch {}
      if (!text || stale) {
        try {
          const response = await fetch(list.url, { cache: "no-store" });
          const body = response.ok ? await response.text() : "";
          if (body.includes("[Adblock")) {
            text = body;
            await IOUtils.writeUTF8(file, body);
          }
        } catch (e) {
          console.warn(`Gecko GX Shields: could not update ${list.id}`, e);
        }
      }
      if (text) {
        for (const line of text.split("\n")) {
          engine.addLine(line);
        }
      }
    }
    this.engine = engine;
    await this.registerCosmeticSheet();
  },

  async registerCosmeticSheet() {
    const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
    if (this.sheetURI && sss.sheetRegistered(this.sheetURI, sss.USER_SHEET)) {
      sss.unregisterSheet(this.sheetURI, sss.USER_SHEET);
    }
    this.sheetURI = null;
    if (!this.adsEnabled || !this.engine.genericHide.length) {
      return;
    }
    const escaped = [...this.off].map(h =>
      h.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")
    );
    const exclude = escaped.length
      ? `(?!([^/]*\\\\.)?(${escaped.join("|")})([:/]|$))`
      : "";
    const rules = this.engine.genericHide
      .map(s => `${s}{display:none!important}`)
      .join("\n");
    const css = `@-moz-document regexp("https?://${exclude}.*") {\n${rules}\n}\n`;
    const file = PathUtils.join(
      PathUtils.profileDir,
      "geckogx-filters",
      `cosmetic-${Date.now()}.css`
    );
    await IOUtils.writeUTF8(file, css);
    for (const child of await IOUtils.getChildren(PathUtils.parent(file))) {
      if (child != file && /cosmetic-\d+\.css$/.test(child)) {
        IOUtils.remove(child).catch(() => {});
      }
    }
    this.sheetURI = Services.io.newFileURI(new FileUtils.File(file));
    sss.loadAndRegisterSheet(this.sheetURI, sss.USER_SHEET);
  },

  configFor(host) {
    const enabled = this.isEnabledFor(host);
    return {
      enabled,
      cookies: enabled && this.cookiesEnabled,
      domainCss:
        enabled && this.adsEnabled
          ? this.engine
              .domainSelectors(host)
              .map(s => `${s}{display:none!important}`)
              .join("\n")
          : "",
    };
  },

  observe(subject, topic) {
    if (topic != "http-on-modify-request" || !this.adsEnabled) {
      return;
    }
    const channel = subject.QueryInterface(Ci.nsIHttpChannel);
    const loadInfo = channel.loadInfo;
    if (
      loadInfo.externalContentPolicyType == Ci.nsIContentPolicy.TYPE_DOCUMENT
    ) {
      return;
    }
    const top = loadInfo.browsingContext?.top;
    const browser = top?.embedderElement;
    if (!browser) {
      return;
    }
    const topURI = top.currentWindowGlobal?.documentURI ?? top.currentURI;
    if (!topURI || !(topURI.schemeIs("https") || topURI.schemeIs("http"))) {
      return;
    }
    const topHost = topURI.host;
    if (
      !this.isEnabledFor(topHost) ||
      !this.engine.matches(channel.URI, topHost)
    ) {
      return;
    }
    channel.cancel(Cr.NS_ERROR_BLOCKED_BY_POLICY);
    this.stats.requests++;
    if (this.stats.requests % 25 == 0) {
      writePref("adsBlockedTotal", this.stats.requests);
    }
    for (const fn of this.listeners) {
      try {
        fn(browser, channel.URI.spec);
      } catch (e) {
        console.error(e);
      }
    }
  },

  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
};

/**
 * Gecko GX replaces the Firefox window, so the session restore signal that
 * normally kicks off delayed startup work (Safe Browsing and tracker list
 * updates, the login manager, protocol handlers) is sent from here instead.
 */
export const GXStartup = {
  done: false,

  windowReady() {
    if (this.done) {
      return;
    }
    this.done = true;
    // Pre-release builds switch these back on at runtime on the default
    // branch, so they are pinned on the user branch.
    for (const pref of [
      "toolkit.telemetry.enabled",
      "app.shield.optoutstudies.enabled",
      "identity.fxaccounts.enabled",
    ]) {
      Services.prefs.setBoolPref(pref, false);
    }
    Services.tm.idleDispatchToMainThread(() => {
      try {
        Services.obs.notifyObservers(null, "sessionstore-windows-restored");
      } catch (e) {
        console.error(e);
      }
      const { SafeBrowsing } = ChromeUtils.importESModule(
        "resource://gre/modules/SafeBrowsing.sys.mjs"
      );
      if (!SafeBrowsing.initialized) {
        SafeBrowsing.init();
      }
    });
  },
};
