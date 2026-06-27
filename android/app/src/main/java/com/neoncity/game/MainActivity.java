package com.neoncity.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * MainActivity
 *
 * A thin Android shell that wraps the NEON CITY game in a full-screen WebView
 * and monetises it with AdMob (banner + interstitial).
 *
 * The game itself is the single dist/index.html file copied into assets/.
 *
 * JS <-> Native bridge (window.Android):
 *   - Android.showInterstitial()  -> show an interstitial (call on death/respawn)
 *   - Android.showBanner()        -> show the bottom banner
 *   - Android.hideBanner()        -> hide the bottom banner
 *
 * Key WebView settings:
 *  - JavaScript enabled (required for the game).
 *  - DOM storage enabled (Web Audio, IndexedDB).
 *  - allowFileAccess so the file:// origin can load sub-resources.
 *  - Hardware-accelerated rendering (GPU compositing for WebGL).
 *  - setWebContentsDebuggingEnabled(true) in debug builds so you can inspect
 *    via chrome://inspect on your desktop browser.
 *
 * For a network-hosted version, replace the "file:///android_asset/index.html"
 * URL with your deployed URL (e.g. https://neon-city.onrender.com).
 */
public class MainActivity extends Activity {

    private static final String TAG = "NeonCity";

    private WebView webView;
    private AdMob ads;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen immersive mode.
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );

        // Root container: WebView fills it; the AdMob banner is layered on top
        // at the bottom (above the touch controls).
        FrameLayout root = new FrameLayout(this);
        setContentView(root);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Disable text selection / long-press menu / overscroll bounce for a
        // native-app feel.
        webView.setOnLongClickListener(v -> true);
        webView.setLongClickable(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        // Enable mixed content (in case you load from http during dev).
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Hardware acceleration for WebGL.
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        // Debuggable via chrome://inspect on your computer (debug builds only).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        }

        // ---- AdMob ----
        ads = new AdMob(this);
        ads.initialise();
        // Show the banner once the WebView has laid out (so we have a root).
        root.post(() -> ads.showBanner(root));

        // ---- JS <-> Native bridge ----
        webView.addJavascriptInterface(new JsBridge(), "Android");

        // Load the bundled game file from assets.
        // To load from your Render deployment instead, change this to:
        //   webView.loadUrl("https://your-app.onrender.com");
        webView.loadUrl("file:///android_asset/index.html");
    }

    /**
     * Methods here are exposed to the game JS as window.Android.* and MUST run
     * on the UI thread for any view work. Each method is kept tiny.
     */
    private final class JsBridge {
        @JavascriptInterface
        public void showInterstitial() {
            Log.d(TAG, "JS: showInterstitial");
            if (ads != null) ads.showInterstitial();
        }

        @JavascriptInterface
        public void showBanner() {
            Log.d(TAG, "JS: showBanner");
            if (ads != null && rootView() != null) ads.showBanner(rootView());
        }

        @JavascriptInterface
        public void hideBanner() {
            Log.d(TAG, "JS: hideBanner");
            if (ads != null) ads.hideBanner();
        }
    }

    private FrameLayout rootView() {
        return (FrameLayout) findViewById(android.R.id.content);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Don't exit the app on back press — the game handles its own navigation.
        // Long-press back or use the task switcher to exit.
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Pause the WebView (reduces CPU/GPU when the app goes to background).
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (ads != null) ads.destroy();
        if (webView != null) webView.destroy();
    }
}
