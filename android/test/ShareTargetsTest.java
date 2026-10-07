package org.sehat.app;

/** Plain-Java checks of ShareTargets (no Android needed): javac -d /tmp/st app/src/main/java/org/sehat/app/ShareTargets.java test/ShareTargetsTest.java && java -cp /tmp/st org.sehat.app.ShareTargetsTest */
public class ShareTargetsTest {
    static int fail = 0, pass = 0;
    static void ok(boolean c, String what) { if (c) pass++; else { fail++; System.out.println("FAIL " + what); } }

    public static void main(String[] a) throws Exception {
        for (String p : new String[]{"com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.imo.android.imoim", "com.facebook.orca"})
            ok(ShareTargets.allowed(p), "allowed " + p);
        for (String p : new String[]{null, "", "com.android.settings", "com.whatsapp ", "com.whatsappx", "COM.WHATSAPP", "org.sehat.app"})
            ok(!ShareTargets.allowed(p), "refused " + p);
        ok(ShareTargets.MIMES.get(0).equals("application/vnd.android.package-archive"), "APK type first");
        ok(ShareTargets.MIMES.get(ShareTargets.MIMES.size() - 1).equals("*/*"), "any file last");
        ok(ShareTargets.fileName().endsWith(".apk"), "file name ends in .apk");
        ok(ShareTargets.stale(false, 0, 0, 10, 5), "missing copy is made");
        ok(ShareTargets.stale(true, 9, 9, 10, 5), "different size is made again");
        ok(ShareTargets.stale(true, 10, 4, 10, 5), "older copy is made again");
        ok(!ShareTargets.stale(true, 10, 6, 10, 5), "fresh copy is kept");
        try { ShareTargets.PACKAGES.add("x"); ok(false, "list is read-only"); } catch (UnsupportedOperationException e) { ok(true, "list is read-only"); }
        // the manifest lists every package (Android 11+ package visibility) and js/share.js offers only listed ones
        String manifest = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("app/src/main/AndroidManifest.xml")), "UTF-8");
        String js = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("../js/share.js")), "UTF-8");
        for (String p : ShareTargets.PACKAGES) {
            ok(manifest.contains("<package android:name=\"" + p + "\" />"), "manifest <queries> has " + p);
            ok(js.contains("'" + p + "'"), "js/share.js offers " + p);
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("'((?:com|org)\\.[a-z0-9_.]+)'").matcher(js);
        while (m.find()) ok(ShareTargets.allowed(m.group(1)), "js package is allowed on Android: " + m.group(1));
        System.out.println(pass + " passed, " + fail + " failed");
        System.exit(fail == 0 ? 0 : 1);
    }
}
