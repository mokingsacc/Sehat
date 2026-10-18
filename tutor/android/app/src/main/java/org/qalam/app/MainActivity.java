package org.qalam.app;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.regex.Pattern;
import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
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
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

/**
 * One WebView showing the phone app (tutor/app, copied into the APK) at https://appassets.androidplatform.net/: a
 * secure origin, so localStorage, the service worker, the camera and the page's own files work as on a website,
 * offline included. The app finds the village hub at its plain-http address (network_security_config.xml allows
 * only those) or the online home baked in at build time (QalamAndroid.online()).
 *
 * window.QalamAndroid (Bridge below): the school day's alarms (setAlarms, cancelAlarms; day.js), the notification
 * question (notifyState, askNotify; asked after "This phone is mine" and its explainer), exactAlarms, openSettings,
 * version, online and print (a certificate, P25b); shareFile (a voice pack, or a sealed school bag, W7) and takeBag
 * (the school bag code the browser's "Open in the Qalam app" handed over, W7). The camera is granted to the app's own page only, after the
 * page's explainer. Links to other sites, the sheet's print page and /get open in the phone's browser.
 */
public class MainActivity extends Activity {
    /** The files the page may hand to the share sheet: a voice pack (C5.6) or a sealed school bag (W7). */
    static final Pattern SHARE_NAME = Pattern.compile("qalam-voice-[a-z]{2,3}\\.qvoice|qalam-bag\\.qbag");
    /** A school bag code handed over by the browser (qalam://bag, its extra "code"): 16 digits, nothing else. */
    static final Pattern BAG_CODE = Pattern.compile("[0-9]{16}");
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_CAMERA = 1;
    private static final int REQ_FILES = 2;
    private static final int REQ_NOTIFY = 3;
    private static final String POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS";   // Android 13+
    private static final int THEME_COLOR = 0xFF0D7C7E;
    private static final int PAGE_COLOR = 0xFFFFFFFF;
    private static volatile boolean onScreen;

    private WebView web;
    private WebViewAssetLoader assetLoader;
    private PermissionRequest pendingCamera;
    private ValueCallback<Uri[]> pendingFiles;
    private Object backCallback;
    private boolean backCallbackRegistered;
    /** The bag code from the last qalam://bag intent, until the page takes it (Bridge.takeBag); kept in memory only. */
    private volatile String bagCode;

    /** Whether the app is in front now: then the page rings its own bell and the alarm shows no notification. */
    static boolean onScreen() {
        return onScreen;
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/", new AppPathHandler(this))
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
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setGeolocationEnabled(false);
        // the village hub is plain http on its own Wi-Fi; the page itself is https, so its calls there are "mixed"
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " QalamAndroid/" + versionName());

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "QalamAndroid");
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> openExternal(Uri.parse(url)));

        keepBagCode(getIntent());
        if (state == null || web.restoreState(state) == null) web.loadUrl(START_URL);
    }

    /* the app was open already: the page is told, and takes the code (W7) */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (keepBagCode(intent) && web != null) web.evaluateJavascript("window.dispatchEvent(new Event('qalam-bag'))", null);
    }

    /* a qalam://bag intent's 16 digits, kept until the page asks; anything else is ignored */
    private boolean keepBagCode(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return false;
        Uri u = intent.getData();
        if (u == null || !"qalam".equals(u.getScheme()) || !"bag".equals(u.getHost())) return false;
        String code = intent.getStringExtra("code");
        if (code == null || !BAG_CODE.matcher(code).matches()) return false;
        bagCode = code;
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        onScreen = true;
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        onScreen = false;
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("QalamAndroid");
            web.destroy();
        }
        super.onDestroy();
    }

    /* the service worker's own fetches of the app's files come from the APK too */
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

    /* Android 15+ draws behind the bars: keep the page inside them and above the keyboard */
    private void keepClearOfSystemBars(View root) {
        if (Build.VERSION.SDK_INT < 30) return;
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    /* the back button walks back through the app's screens */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
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

    static boolean isOurs(Uri u) {
        return u != null && "https".equals(u.getScheme()) && HOST.equals(u.getHost());
    }

    private void openExternal(Uri u) {
        String scheme = u == null || u.getScheme() == null ? "" : u.getScheme();
        if (!scheme.equals("http") && !scheme.equals("https")) return;   // web links only: no intents, no dialer
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException | SecurityException ignored) {
        }
    }

    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
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
            if (view == web) {     // the page was killed (low memory on old phones): start again, never crash
                ((ViewGroup) web.getParent()).removeView(web);
                web.destroy();
                web = null;
                recreate();
            }
            return true;
        }
    }

    private boolean has(String permission) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private final class Chrome extends WebChromeClient {
        /** The camera, and only the camera, for the app's own page (photo marking); nothing for any other page. */
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean videoOnly = request.getResources().length > 0;
            for (String r : request.getResources()) if (!PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) videoOnly = false;
            if (!videoOnly || !isOurs(request.getOrigin())) {
                request.deny();
                return;
            }
            if (has(Manifest.permission.CAMERA)) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                return;
            }
            if (pendingCamera != null) pendingCamera.deny();
            pendingCamera = request;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (request == pendingCamera) pendingCamera = null;
        }

        /** <input type="file">: the phone's own picker (photo marking's fallback when the camera in the page cannot start). */
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILES);
                return true;
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILES) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (pendingFiles == null) return;
        pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        pendingFiles = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_CAMERA && pendingCamera != null) {
            if (granted) pendingCamera.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingCamera.deny();
            pendingCamera = null;
        } else if (requestCode == REQ_NOTIFY && web != null) {
            web.evaluateJavascript("window.dispatchEvent(new Event('qalam-notify'))", null);   // the page redraws its row
        }
    }

    private String versionName() {
        try {
            PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
            return p.versionName == null ? "" : p.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    /** window.QalamAndroid. Methods run on a background thread; none returns anything about a learner. */
    final class Bridge {
        // P27a (C4.4): the APK has no microphone permission (C3.6), so the page draws no mic and "say it" is "hear it,
        // say it"; nothing records here in 2027
        @JavascriptInterface
        public boolean canRecord() {
            return false;
        }

        @JavascriptInterface
        public String version() {
            return versionName();
        }

        /** The online home this APK was built for (https://host), or "" for a hub-only app. */
        @JavascriptInterface
        public String online() {
            return getString(R.string.online_url);
        }

        /** The next seven days of bells and wake-ups, {title, alarms: [{at, kind}]} (day.js alarmPlan). */
        @JavascriptInterface
        public void setAlarms(String json) {
            Alarms.save(getApplicationContext(), json);
        }

        @JavascriptInterface
        public void cancelAlarms() {
            Alarms.cancel(getApplicationContext());
        }

        /** "on": notifications can show; "ask": Android 13+, not allowed yet; "off": switched off in the phone's settings. */
        @JavascriptInterface
        public String notifyState() {
            if (NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled()) return "on";
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return "ask";
            return "off";
        }

        /** Android 13+: the phone's own question, after the page's explainer. */
        @JavascriptInterface
        public void askNotify() {
            if (Build.VERSION.SDK_INT < 33) return;
            runOnUiThread(() -> {
                if (checkSelfPermission(POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{POST_NOTIFICATIONS}, REQ_NOTIFY);
            });
        }

        /** False only on Android 12 without exact alarms: bells then come within 5 minutes. */
        @JavascriptInterface
        public boolean exactAlarms() {
            return Alarms.exactAllowed(MainActivity.this);
        }

        /** P25b: the phone's print dialog for this page as it prints (a certificate, A4 landscape). The title names
         *  no one ("Qalam certificate QC-..."); the typed name is only in the page, and nothing is kept here. */
        @JavascriptInterface
        public void print(String title) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) return;
                String t = title == null ? "Qalam" : title;
                PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape()).build();
                pm.print(t, web.createPrintDocumentAdapter(t), attrs);
            });
        }

        /** The voice pack (C5.6, the owner's note of 17 Oct): the page hands the kept file over, and the phone's share
         *  sheet sends it (Bluetooth, Files, a messenger). Only a file named like a voice pack, written to this app's
         *  cache and handed out read-only through the FileProvider; no permission is needed. */
        @JavascriptInterface
        public boolean shareFile(String name, String base64) {
            if (name == null || base64 == null || !SHARE_NAME.matcher(name).matches()) return false;
            try {
                byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
                if (bytes.length > 40 * 1024 * 1024) return false;
                File dir = new File(getCacheDir(), "share");
                if (!dir.isDirectory() && !dir.mkdirs()) return false;
                File f = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(bytes);
                }
                Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".share", f);
                Intent send = new Intent(Intent.ACTION_SEND).setType("application/octet-stream")
                        .putExtra(Intent.EXTRA_STREAM, u).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> {
                    try {
                        startActivity(Intent.createChooser(send, null));
                    } catch (ActivityNotFoundException ignored) {
                    }
                });
                return true;
            } catch (IOException | IllegalArgumentException e) {
                return false;
            }
        }

        /** W7: the school bag code the browser handed over, once (then forgotten); "" when there is none. */
        @JavascriptInterface
        public String takeBag() {
            String c = bagCode;
            bagCode = null;
            return c == null ? "" : c;
        }

        /** The phone's settings page for Qalam (to allow the camera or notifications after a refusal). */
        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                } catch (ActivityNotFoundException ignored) {
                }
            });
        }
    }
}
