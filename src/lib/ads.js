/**
 * ads.js — thin, SAFE bridge to the native AdMob layer injected by the Android
 * WebView as window.Android. On web/desktop (no bridge) every call is a no-op,
 * so this file is safe to import everywhere and never throws.
 *
 *   showInterstitial()  -> request a full-screen ad (call on death/respawn)
 *   showBanner()        -> show the bottom banner
 *   hideBanner()        -> hide the bottom banner
 *
 * The native side lives in AdMob.java / MainActivity.java (JsBridge).
 */

// window.Android is injected by addJavascriptInterface in MainActivity.
const android = () => {
  try {
    // Guard: only exists inside the app's WebView.
    // eslint-disable-next-line no-undef
    if (typeof window !== "undefined" && window.Android) return window.Android;
  } catch (_) {
    /* not in the app */
  }
  return null;
};

export const isNative = () => android() !== null;

// Rate-limit interstitials so we don't spam ads on rapid deaths.
const MIN_INTERVAL_MS = 45_000; // ~max one interstitial every 45s (Play policy friendly)
let lastShown = 0;

export function showInterstitial() {
  const a = android();
  if (!a) return; // web preview — no-op
  const now = Date.now();
  if (now - lastShown < MIN_INTERVAL_MS) return;
  lastShown = now;
  try {
    a.showInterstitial();
  } catch (_) {
    /* ignore — never let ads break the game */
  }
}

export function showBanner() {
  const a = android();
  if (!a) return;
  try {
    a.showBanner();
  } catch (_) {
    /* ignore */
  }
}

export function hideBanner() {
  const a = android();
  if (!a) return;
  try {
    a.hideBanner();
  } catch (_) {
    /* ignore */
  }
}
