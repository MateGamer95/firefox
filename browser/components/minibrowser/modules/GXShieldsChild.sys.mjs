/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Containers of common consent management platforms.
const COOKIE_BANNERS = [
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#CybotCookiebotDialogBodyUnderlay",
  ".qc-cmp2-container",
  "#qc-cmp2-container",
  "#usercentrics-root",
  "#usercentrics-cmp-ui",
  ".fc-consent-root",
  "#didomi-host",
  "#cmpbox",
  "#cmpbox2",
  ".cmpboxBG",
  "div[id^='sp_message_container']",
  "#truste-consent-track",
  ".truste_overlay",
  "#cookiescript_injected",
  ".cc-window",
  "#cookie-law-info-bar",
  ".cky-consent-container",
  ".cky-overlay",
  "#BorlabsCookieBox",
  "#iubenda-cs-banner",
  ".osano-cm-window",
  "#hs-eu-cookie-confirmation",
  "#axeptio_overlay",
  "#tarteaucitronRoot",
  "#cookie-notice",
];

// "Reject all" buttons of the same platforms.
const REJECT_BUTTONS = [
  "#onetrust-reject-all-handler",
  "#CybotCookiebotDialogBodyButtonDecline",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
  ".qc-cmp2-summary-buttons button[mode='secondary']",
  "button[data-testid='uc-deny-all-button']",
  ".fc-cta-do-not-consent",
  "#didomi-notice-disagree-button",
  ".cmpboxbtnno",
  ".cky-btn-reject",
  "#cookie_action_close_header_reject",
  "._brlbs-refuse-btn",
  ".iubenda-cs-reject-btn",
  ".osano-cm-denyAll",
  "#tarteaucitronAllDenied2",
  ".cc-deny",
  "button.sp_choice_type_REJECT_ALL",
  ".axeptio_btn_dismiss",
];

const SCROLL_UNLOCK = [
  "html.sp-message-open",
  "body.sp-message-open",
  "body.didomi-popup-open",
  "html.qc-cmp-ui-showing",
  "body.qc-cmp-ui-showing",
  "body.cmp-shown",
  "html.cmp-shown",
];

/**
 * Applies site-specific element hiding and dismisses cookie banners.
 */
export class GXShieldsChild extends JSWindowActorChild {
  async handleEvent(event) {
    if (event.type != "DOMContentLoaded") {
      return;
    }
    const win = this.contentWindow;
    if (!win || !/^https?:$/.test(win.location.protocol)) {
      return;
    }
    let config;
    try {
      config = await this.sendQuery("GXShields:Config", {
        host: win.location.host,
      });
    } catch {
      return;
    }
    if (!config?.enabled || this.contentWindow != win) {
      return;
    }
    let css = config.domainCss;
    if (config.cookies) {
      css += `\n${COOKIE_BANNERS.map(s => `${s}{display:none!important}`).join("\n")}`;
      css += `\n${SCROLL_UNLOCK.join(",")}{overflow:auto!important;position:static!important}`;
    }
    if (css.trim()) {
      try {
        win.windowUtils.loadSheetUsingURIString(
          `data:text/css;charset=utf-8,${encodeURIComponent(css)}`,
          win.windowUtils.AUTHOR_SHEET
        );
      } catch {}
    }
    if (config.cookies) {
      this.rejectCookieBanner(win);
    }
  }

  rejectCookieBanner(win) {
    const doc = win.document;
    const attempt = () => {
      for (const selector of REJECT_BUTTONS) {
        const button = doc.querySelector(selector);
        if (button) {
          button.click();
          return true;
        }
      }
      return false;
    };
    if (attempt()) {
      return;
    }
    let tries = 0;
    const observer = new win.MutationObserver(() => {
      if (attempt() || ++tries > 300) {
        observer.disconnect();
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    win.setTimeout(() => observer.disconnect(), 15000);
  }
}
