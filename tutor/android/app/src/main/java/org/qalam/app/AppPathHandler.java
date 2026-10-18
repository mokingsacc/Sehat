package org.qalam.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the phone app from the APK's assets folder "www/" at https://appassets.androidplatform.net/ (the whole
 * origin, so the app's relative paths work as on the hub). "" and "dir/" are index.html; anything not in the APK,
 * /api/ included, is a plain 404, never the network: the hub and the online home are reached by their own addresses
 * (app/js/hub.js).
 */
final class AppPathHandler implements WebViewAssetLoader.PathHandler {
    private static final String ROOT = "www/";
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("woff2", "font/woff2");
        MIME.put("opus", "audio/ogg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("txt", "text/plain");
    }

    private final AssetManager assets;

    AppPathHandler(Context context) {
        this.assets = context.getAssets();
    }

    @Nullable
    @Override
    public WebResourceResponse handle(@NonNull String path) {
        if (path.contains("..") || path.startsWith("/")) return notFound();
        if (path.isEmpty() || path.endsWith("/")) path = path + "index.html";
        String mime = mimeOf(path);
        boolean text = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("+xml");
        try {
            InputStream in = assets.open(ROOT + path, AssetManager.ACCESS_STREAMING);
            WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    private static String mimeOf(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        String m = MIME.get(ext);
        return m != null ? m : "application/octet-stream";
    }
}
