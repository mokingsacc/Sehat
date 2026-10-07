# The JavaScript bridge is called by name from the web page.
-keepclassmembers class org.sehat.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*
