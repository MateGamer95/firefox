/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const HOMEPAGE = "https://www.mozilla.org/";

let browser, urlbar, backButton, forwardButton, reloadButton, progress, status;
let isLoading = false;

// Must be kept alive: the web progress only holds a weak reference.
const progressListener = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  onLocationChange(webProgress, request, location) {
    if (!webProgress.isTopLevel) {
      return;
    }
    if (document.activeElement != urlbar) {
      urlbar.value = location.spec == "about:blank" ? "" : location.spec;
    }
    updateNavButtons();
  },

  onStateChange(webProgress, request, stateFlags, statusCode) {
    if (
      !webProgress.isTopLevel ||
      !(stateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)
    ) {
      return;
    }
    if (stateFlags & Ci.nsIWebProgressListener.STATE_START) {
      setLoading(true);
    } else if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      setLoading(false);
      updateTitle();
    }
  },

  onStatusChange(webProgress, request, statusCode, message) {
    status.textContent = message;
  },

  onProgressChange() {},
  onSecurityChange() {},
  onContentBlockingEvent() {},
};

function setLoading(loading) {
  isLoading = loading;
  progress.toggleAttribute("loading", loading);
  reloadButton.textContent = loading ? "✕" : "↻";
  if (!loading) {
    status.textContent = "";
  }
  updateNavButtons();
}

function updateNavButtons() {
  backButton.disabled = !browser.canGoBack;
  forwardButton.disabled = !browser.canGoForward;
}

function updateTitle() {
  let title = browser.contentTitle;
  document.title = title ? `${title} – Minibrowser` : "Minibrowser";
}

function navigate(input) {
  input = input.trim();
  if (!input) {
    return;
  }
  try {
    browser.fixupAndLoadURIString(input, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      loadFlags:
        Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP |
        Ci.nsIWebNavigation.LOAD_FLAGS_FIXUP_SCHEME_TYPOS,
    });
    browser.focus();
  } catch (e) {
    status.textContent = `Kann nicht laden: ${input}`;
    console.error(e);
  }
}

function onKeyDown(event) {
  if (event.altKey && event.key == "ArrowLeft") {
    browser.goBack();
  } else if (event.altKey && event.key == "ArrowRight") {
    browser.goForward();
  } else if (event.key == "F5" || (event.ctrlKey && event.key == "r")) {
    browser.reload();
  } else if (event.key == "Escape" && isLoading) {
    browser.stop();
  } else if (
    (event.ctrlKey && event.key == "l") ||
    (event.altKey && event.key == "d")
  ) {
    urlbar.focus();
    urlbar.select();
  } else {
    return;
  }
  event.preventDefault();
}

window.addEventListener(
  "load",
  () => {
    browser = document.getElementById("content");
    urlbar = document.getElementById("urlbar");
    backButton = document.getElementById("back");
    forwardButton = document.getElementById("forward");
    reloadButton = document.getElementById("reload");
    progress = document.getElementById("progress");
    status = document.getElementById("status");

    browser.addProgressListener(
      progressListener,
      Ci.nsIWebProgress.NOTIFY_LOCATION |
        Ci.nsIWebProgress.NOTIFY_STATE_WINDOW |
        Ci.nsIWebProgress.NOTIFY_STATUS
    );
    browser.addEventListener("pagetitlechanged", updateTitle);

    backButton.addEventListener("click", () => browser.goBack());
    forwardButton.addEventListener("click", () => browser.goForward());
    reloadButton.addEventListener("click", () =>
      isLoading ? browser.stop() : browser.reload()
    );
    document
      .getElementById("home")
      .addEventListener("click", () => navigate(HOMEPAGE));

    urlbar.addEventListener("keydown", event => {
      if (event.key == "Enter") {
        navigate(urlbar.value);
      } else if (event.key == "Escape") {
        urlbar.value = browser.currentURI?.spec ?? "";
        browser.focus();
      }
    });
    urlbar.addEventListener("focus", () => urlbar.select());
    window.addEventListener("keydown", onKeyDown, true);

    navigate(HOMEPAGE);
  },
  { once: true }
);
