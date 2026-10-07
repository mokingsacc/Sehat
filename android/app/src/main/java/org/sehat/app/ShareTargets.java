package org.sehat.app;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * The messaging apps the "Share Sehat" screen can hand the APK to directly (js/share.js APPS), and the file types to try.
 * Plain Java (no Android classes), so it is unit-tested on its own: android/test/ShareTargetsTest.java.
 * Keep this list, js/share.js and the {@code <queries>} in AndroidManifest.xml in step: Android 11+ hides other apps
 * from isInstalled() unless they are listed there.
 */
final class ShareTargets {
    private ShareTargets() {}

    /** WhatsApp (and Business), Telegram (and its web build, Telegram X), IMO (and beta, lite), Messenger (and Lite). */
    static final List<String> PACKAGES = Collections.unmodifiableList(Arrays.asList(
            "com.whatsapp", "com.whatsapp.w4b",
            "org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram",
            "com.imo.android.imoim", "com.imo.android.imoimbeta", "com.imo.android.imoimlite",
            "com.facebook.orca", "com.facebook.mlite"));

    static final String APK_MIME = "application/vnd.android.package-archive";

    /** File types to offer, best first: some apps only accept "any file" for a document. */
    static final List<String> MIMES = Collections.unmodifiableList(Arrays.asList(APK_MIME, "application/octet-stream", "*/*"));

    /** Only the listed apps can be asked about or sent to from the page. */
    static boolean allowed(String pkg) {
        return pkg != null && PACKAGES.contains(pkg);
    }

    /** The name the file has on the other phone: always ends in .apk so the phone offers to install it. */
    static String fileName() {
        return "sehat.apk";
    }

    /** Whether the cached copy of the APK must be made again (missing, different size, or older than the installed APK). */
    static boolean stale(boolean exists, long cachedLength, long cachedModified, long apkLength, long apkModified) {
        return !exists || cachedLength != apkLength || cachedModified < apkModified;
    }
}
