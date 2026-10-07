package org.sehat.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the bundled web app from the APK assets folder "www/" for
 * https://appassets.androidplatform.net/assets/... (registered with WebViewAssetLoader).
 *
 * Differences from WebViewAssetLoader.AssetsPathHandler:
 *  - "" and "dir/" map to index.html (the service worker precaches "./"),
 *  - a small script (assets/fhb-android.js) is inlined into index.html so the page can use the Android bridge
 *    for sharing files (the WebView has no Web Share API),
 *  - correct MIME types for module scripts, JSON, fonts, SVG, audio, web manifest.
 */
final class WebAppPathHandler implements WebViewAssetLoader.PathHandler {
    private static final String ROOT = "www/";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("gif", "image/gif");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff2", "font/woff2");
        MIME.put("woff", "font/woff");
        MIME.put("ttf", "font/ttf");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("m4a", "audio/mp4");
        MIME.put("aac", "audio/aac");
        MIME.put("ogg", "audio/ogg");
        MIME.put("opus", "audio/ogg");
        MIME.put("webm", "audio/webm");
        MIME.put("wav", "audio/wav");
        MIME.put("txt", "text/plain");
        MIME.put("md", "text/plain");
    }

    private final AssetManager assets;

    WebAppPathHandler(Context context) {
        this.assets = context.getAssets();
    }

    @Nullable
    @Override
    public WebResourceResponse handle(@NonNull String path) {
        if (path.contains("..") || path.startsWith("/")) return notFound();
        if (path.isEmpty() || path.endsWith("/")) path = path + "index.html";
        String mime = mimeOf(path);
        boolean text = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("+xml") || mime.equals("image/svg+xml");
        try {
            InputStream in;
            if (path.equals("index.html")) {
                in = new ByteArrayInputStream(indexWithShim());
            } else {
                in = assets.open(ROOT + path, AssetManager.ACCESS_STREAMING);
            }
            WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            r.setResponseHeaders(headers);
            return r;
        } catch (FileNotFoundException e) {
            return notFound();
        } catch (IOException e) {
            return notFound();
        }
    }

    private byte[] indexWithShim() throws IOException {
        String html = new String(read(assets.open(ROOT + "index.html")), UTF8);
        String shim = new String(read(assets.open("fhb-android.js")), UTF8);
        String tag = "<script>\n" + shim + "\n</script>\n";
        int at = html.indexOf("<script");
        if (at < 0) at = html.indexOf("</head>");
        html = at < 0 ? tag + html : html.substring(0, at) + tag + html.substring(at);
        return html.getBytes(UTF8);
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

    private static byte[] read(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            in.close();
        }
    }
}
