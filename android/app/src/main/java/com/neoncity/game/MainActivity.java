package com.neoncity.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleCaptureOutputStream;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * MainActivity
 *
 * A thin Android shell that wraps the NEON CITY game in a full-screen WebView.
 * The game itself is the single dist/index.html file copied into assets/.
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

    private WebView webView;

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

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Enable mixed content (in case you load from http during dev).
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Hardware acceleration for WebGL.
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        // Debuggable via chrome://inspect on your computer (remove for release).
        webView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // Load the bundled game file from assets.
        // To load from your Render deployment instead, change this to:
        //   webView.loadUrl("https://your-app.onrender.com");
        webView.loadUrl("file:///android_asset/index.html");
    }

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
        if (webView != null) webView.destroy();
    }
}
