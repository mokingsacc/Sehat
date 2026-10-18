# The JavaScript bridge is called by name from the page (window.QalamAndroid).
-keepclassmembers class org.qalam.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*
