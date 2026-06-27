package com.neoncity.game;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;

/**
 * AdMob — manages a bottom banner + an interstitial for NEON CITY.
 *
 * Test ad-unit IDs are used by default (Google's documented test units) so the
 * app works immediately and won't get your account flagged for invalid traffic
 * during development. Before publishing, replace them with your real ad-unit IDs
 * from your AdMob console (https://apps.admob.com).
 */
public class AdMob {

    private static final String TAG = "NeonCityAdMob";

    // -----------------------------------------------------------------------
    //  AD-UNIT IDS  —  replace these with your REAL AdMob ad-unit IDs before
    //  publishing to Google Play. The test IDs below show sample ads and must
    //  NOT be used in a production release.
    // -----------------------------------------------------------------------
    private static final String BANNER_ID =
            "ca-app-pub-3940256099942544/6300978111";   // TEST banner
    private static final String INTERSTITIAL_ID =
            "ca-app-pub-3940256099942544/1033173712";   // TEST interstitial

    private final Activity activity;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private AdView banner;
    private InterstitialAd interstitial;
    private boolean initialised = false;

    public AdMob(Activity activity) {
        this.activity = activity;
    }

    /** Initialise the SDK. Safe to call on the main thread. */
    public void initialise() {
        if (initialised) return;
        initialised = true;
        MobileAds.initialize(activity, status -> {
            Log.d(TAG, "MobileAds initialised.");
            // Pre-warm an interstitial so it's ready when the game asks for it.
            loadInterstitial();
        });
    }

    // ------------------------------------------------------------------- banner

    /**
     * Add the banner to the bottom of {@code root} and show it. The banner sits
     * above the WebView so it never covers the touch controls.
     */
    public void showBanner(FrameLayout root) {
        ui.post(() -> {
            if (banner != null) {
                banner.setVisibility(View.VISIBLE);
                return;
            }
            banner = new AdView(activity);
            banner.setAdUnitId(BANNER_ID);
            banner.setAdSize(AdSize.BANNER); // 320x50, scales per-density
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            lp.gravity = android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL;
            banner.setLayoutParams(lp);
            root.addView(banner);
            banner.loadAd(new AdRequest.Builder().build());
            Log.d(TAG, "Banner added & loading.");
        });
    }

    /** Temporarily hide the banner (keeps it loaded). */
    public void hideBanner() {
        ui.post(() -> {
            if (banner != null) banner.setVisibility(View.GONE);
        });
    }

    /** Height of the banner in px (so the WebView can pad its bottom). */
    public int bannerHeightPx() {
        if (banner == null) return 0;
        return banner.getHeight();
    }

    // -------------------------------------------------------------- interstitial

    private void loadInterstitial() {
        InterstitialAd.load(activity, INTERSTITIAL_ID,
                new AdRequest.Builder().build(),
                new InterstitialAdLoadCallback() {
                    @Override
                    public void onAdLoaded(InterstitialAd ad) {
                        interstitial = ad;
                        Log.d(TAG, "Interstitial loaded.");
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError err) {
                        interstitial = null;
                        Log.w(TAG, "Interstitial failed: " + err.getMessage());
                    }
                });
    }

    /**
     * Show the interstitial now if it's ready. Reloads the next one after show.
     * Called from JS via the bridge (e.g. on player death/respawn).
     */
    public void showInterstitial() {
        ui.post(() -> {
            if (interstitial == null) {
                // Not ready yet — try again silently.
                loadInterstitial();
                return;
            }
            interstitial.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    interstitial = null;
                    loadInterstitial();
                }
                @Override
                public void onAdFailedToShowFullScreenContent(AdError e) {
                    interstitial = null;
                    loadInterstitial();
                }
            });
            if (!activity.isFinishing()) {
                interstitial.show(activity);
            }
        });
    }

    /** Release banner resources on destroy. */
    public void destroy() {
        if (banner != null) banner.destroy();
    }
}
