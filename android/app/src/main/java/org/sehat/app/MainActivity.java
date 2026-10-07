package org.sehat.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.core.content.FileProvider;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.List;

/** One WebView showing the bundled web app at https://appassets.androidplatform.net/assets/index.html. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/assets/index.html";
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final int REQ_MIC = 1;
    private static final int REQ_LOCATION = 2;
    private static final int REQ_FILES = 3;
    private static final int THEME_COLOR = 0xFFB6322D;
    private static final int PAGE_COLOR = 0xFFFBFAF7;

    private WebView web;
    private WebViewAssetLoader assetLoader;
    private PermissionRequest pendingMic;
    private ValueCallback<Uri[]> pendingFiles;   // a file chooser the page opened (family records: a photo, a records file)
    private Uri cameraUri;                       // where the camera writes a new photo
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private Object backCallback;           // OnBackInvokedCallback on Android 13+
    private boolean backCallbackRegistered;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebAppPathHandler(this))
                .build();
        setUpServiceWorker();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(THEME_COLOR);
        web = new WebView(this);
        web.setBackgroundColor(PAGE_COLOR);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        keepClearOfSystemBars(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " FHBAndroid/" + versionName());

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "FHBAndroid");
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            Uri u = Uri.parse(url);
            if ("http".equals(u.getScheme()) || "https".equals(u.getScheme())) openExternal(u);
        });

        if (state == null || web.restoreState(state) == null) web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("FHBAndroid");
            web.destroy();
        }
        super.onDestroy();
    }

    /* ---------- the service worker's own fetches must also come from the APK ---------- */
    private void setUpServiceWorker() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
                && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }
            });
        }
    }

    /* ---------- Android 15+ draws behind the bars; keep the page inside them (and above the keyboard) ---------- */
    private void keepClearOfSystemBars(View root) {
        if (Build.VERSION.SDK_INT < 30) return;   // older versions resize the window themselves
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    /* ---------- back button walks back through the book ---------- */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {   // Android 12 and older
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void updateBackCallback() {
        if (Build.VERSION.SDK_INT < 33 || web == null) return;
        boolean want = web.canGoBack();
        if (want == backCallbackRegistered) return;
        if (backCallback == null) backCallback = (OnBackInvokedCallback) () -> { if (web != null && web.canGoBack()) web.goBack(); };
        if (want) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, (OnBackInvokedCallback) backCallback);
        else getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback((OnBackInvokedCallback) backCallback);
        backCallbackRegistered = want;
    }

    /* ---------- links: the book stays inside, everything else (maps, phone calls) opens in other apps ---------- */
    private static boolean isOurs(Uri u) {
        return "https".equals(u.getScheme()) && HOST.equals(u.getHost());
    }

    private void openExternal(Uri u) {
        try {
            Intent i;
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("intent")) {
                i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
            } else if (scheme.equals("tel")) {
                i = new Intent(Intent.ACTION_DIAL, u);
            } else {
                i = new Intent(Intent.ACTION_VIEW, u);
                if (scheme.equals("http") || scheme.equals("https")) i.addCategory(Intent.CATEGORY_BROWSABLE);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException | java.net.URISyntaxException | SecurityException e) {
            Toast.makeText(this, u.toString(), Toast.LENGTH_LONG).show();
        }
    }

    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {   // Android 7+
            return route(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {   // Android 5 and 6
            return route(Uri.parse(url));
        }

        private boolean route(Uri u) {
            if (isOurs(u)) return false;
            openExternal(u);
            return true;
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            updateBackCallback();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // the page's renderer was killed (low memory on old phones): start fresh instead of crashing
            if (view == web) {
                ((ViewGroup) web.getParent()).removeView(web);
                web.destroy();
                web = null;
                recreate();
            }
            return true;
        }
    }

    /* ---------- microphone (recording studio, voice feedback) and location (nearest clinic) ---------- */
    private boolean has(String permission) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean audioOnly = request.getResources().length > 0;
            for (String r : request.getResources()) if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audioOnly = false;
            if (!audioOnly || !isOurs(request.getOrigin())) { request.deny(); return; }
            if (has(Manifest.permission.RECORD_AUDIO)) { request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); return; }
            if (pendingMic != null) pendingMic.deny();
            pendingMic = request;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
        }

        /** <input type="file">: the phone's file picker; for pictures also the camera (no camera permission needed). */
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            cameraUri = null;
            boolean image = false;
            for (String t : params.getAcceptTypes()) if (t != null && t.startsWith("image")) image = true;
            Intent pick;
            try {
                pick = params.createIntent();
            } catch (Exception e) {
                pick = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*");
            }
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            Intent chooser = Intent.createChooser(pick, null);
            if (image) {
                try {
                    File dir = new File(getCacheDir(), "photos");
                    if (!dir.isDirectory()) //noinspection ResultOfMethodCallIgnored
                        dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    File out = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
                    cameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", out);
                    Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                    cam.setClipData(ClipData.newRawUri("photo", cameraUri));
                    cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (cam.resolveActivity(getPackageManager()) != null) {
                        if (params.isCaptureEnabled()) chooser = cam;
                        else chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                    }
                } catch (Exception e) {
                    cameraUri = null;
                }
            }
            try {
                startActivityForResult(chooser, REQ_FILES);
                return true;
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                cameraUri = null;
                return false;
            }
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (request == pendingMic) pendingMic = null;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!isOurs(Uri.parse(origin))) { callback.invoke(origin, false, false); return; }
            if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, true, false);
                return;
            }
            if (pendingGeoCallback != null) pendingGeoCallback.invoke(pendingGeoOrigin, false, false);
            pendingGeoOrigin = origin;
            pendingGeoCallback = callback;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        }

        @Override
        public void onGeolocationPermissionsHidePrompt() {
            pendingGeoOrigin = null;
            pendingGeoCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILES) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (pendingFiles == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && (data.getData() != null || data.getClipData() != null)) result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            else if (cameraUri != null) result = new Uri[]{cameraUri};
        }
        pendingFiles.onReceiveValue(result);
        pendingFiles = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        boolean any = false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) any = true;
        if (requestCode == REQ_MIC && pendingMic != null) {
            if (any) pendingMic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingMic.deny();
            pendingMic = null;
        } else if (requestCode == REQ_LOCATION && pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, any, false);   // coarse alone is enough for "nearest clinic"
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    /* ---------- sharing ---------- */
    private String versionName() {
        try {
            PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
            return p.versionName == null ? "" : p.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    private File shareDir() {
        File dir = new File(getCacheDir(), "share");
        if (!dir.isDirectory() && !dir.mkdirs()) return getCacheDir();
        return dir;
    }

    private void send(File file, String mime, String chooserTitle) {
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", file);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.setClipData(ClipData.newRawUri(file.getName(), uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, chooserTitle);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        runOnUiThread(() -> {
            try {
                startActivity(chooser);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "No app can send this file", Toast.LENGTH_LONG).show();
            }
        });
    }

    private static void copy(InputStream in, File to) throws IOException {
        try (InputStream i = in; OutputStream o = new FileOutputStream(to)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = i.read(buf)) > 0) o.write(buf, 0, n);
        }
    }

    /** The installed APK copied to the cache as sehat.apk (made again only when the app was updated). */
    private synchronized File apkCopy() throws IOException {
        File apk = new File(getApplicationInfo().sourceDir);
        File dir = shareDir();
        File out = new File(dir, ShareTargets.fileName());
        if (ShareTargets.stale(out.exists(), out.length(), out.lastModified(), apk.length(), apk.lastModified())) {
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                f.delete();
            File tmp = new File(dir, "sehat.apk.part");
            copy(new FileInputStream(apk), tmp);
            if (!tmp.renameTo(out)) throw new IOException("rename failed");
        }
        return out;
    }

    /** Copies the installed APK to the cache and opens the share sheet (Quick Share, Bluetooth, Files, ShareIt ...). */
    void shareApk() {
        new Thread(() -> {
            try {
                send(apkCopy(), APK_MIME, "فرستادن برنامهٔ صحت · د صحت اپ لېږل");
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "Could not share the app: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    /**
     * Sends the APK straight to one messaging app (ShareTargets.PACKAGES). Returns false when that app is not on the
     * phone or takes none of the file types; the page then opens the share sheet instead.
     */
    boolean shareApkTo(String pkg) {
        if (!ShareTargets.allowed(pkg) || !installed(pkg)) return false;
        try {
            return sendTo(apkCopy(), ShareTargets.MIMES, pkg, this::shareApk);
        } catch (Exception e) {
            return false;
        }
    }

    /** Sends one file straight to one listed app, trying each type in turn; false when that app takes none of them. */
    private boolean sendTo(File file, List<String> mimes, String pkg, Runnable fallback) {
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", file);
        for (String mime : mimes) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.setPackage(pkg);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri(file.getName(), uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            if (getPackageManager().queryIntentActivities(send, 0).isEmpty()) continue;
            grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            runOnUiThread(() -> {
                try {
                    startActivity(send);
                } catch (ActivityNotFoundException | SecurityException e) {
                    fallback.run();   // the app refused after all: offer every way
                }
            });
            return true;
        }
        return false;
    }

    /** A file made by the page, written to the share folder (only a plain file name is kept). */
    private File pageFile(String base64, String name) throws IOException {
        String safe = (name == null ? "" : name).replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.isEmpty() || safe.startsWith(".")) safe = "file" + safe;
        File out = new File(shareDir(), safe);
        try (OutputStream o = new FileOutputStream(out)) {
            o.write(Base64.decode(base64, Base64.DEFAULT));
        }
        return out;
    }

    /** Whether a listed messaging app is on this phone (Android 11+ needs the <queries> in AndroidManifest.xml). */
    boolean installed(String pkg) {
        if (!ShareTargets.allowed(pkg)) return false;
        try {
            getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Called from the page as window.FHBAndroid. Methods run on a background thread. */
    final class Bridge {
        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }

        @JavascriptInterface
        public String appVersion() {
            return versionName();
        }

        /** Opens the share sheet with the APK: Quick Share / Nearby Share and Bluetooth show nearby phones there. */
        @JavascriptInterface
        public void shareApp() {
            shareApk();
        }

        /** Sends the APK to one listed messaging app (com.whatsapp, org.telegram.messenger ...); false = not possible. */
        @JavascriptInterface
        public boolean shareAppTo(String pkg) {
            return shareApkTo(pkg);
        }

        /** Whether a listed messaging app is installed (other packages always answer false). */
        @JavascriptInterface
        public boolean isInstalled(String pkg) {
            return installed(pkg);
        }

        /** Size of the APK in bytes, to tell people how big the file is. */
        @JavascriptInterface
        public long apkSize() {
            return new File(getApplicationInfo().sourceDir).length();
        }

        /** Shares a file made by the page (e.g. the recordings zip). base64 = the file's bytes. */
        @JavascriptInterface
        public boolean shareFile(String base64, String name, String mime) {
            try {
                File out = pageFile(base64, name);
                send(out, mime == null || mime.isEmpty() ? "application/octet-stream" : mime, out.getName());
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Sends a file made by the page (the family records file) straight to one listed messaging app. */
        @JavascriptInterface
        public boolean shareFileTo(String base64, String name, String mime, String pkg) {
            if (!ShareTargets.allowed(pkg) || !installed(pkg)) return false;
            try {
                File out = pageFile(base64, name);
                String m = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
                return sendTo(out, Arrays.asList(m, "application/octet-stream", "*/*"), pkg, () -> send(out, m, out.getName()));
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean shareText(String title, String text) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
            if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
            Intent chooser = Intent.createChooser(send, title);
            runOnUiThread(() -> {
                try {
                    startActivity(chooser);
                } catch (ActivityNotFoundException ignored) {
                }
            });
            return true;
        }
    }
}
