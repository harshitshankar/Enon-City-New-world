# Add project specific ProGuard rules here.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ---- Google Mobile Ads (AdMob) ----
# Keep the Ads SDK classes (safe even though minify is off in release for now).
-keep public class com.google.android.gms.ads.** { public *; }
-dontwarn com.google.android.gms.ads.**

# Keep JS bridge interface (called from WebView JS).
-keepclassmembers class com.neoncity.game.** {
    @android.webkit.JavascriptInterface <methods>;
}
