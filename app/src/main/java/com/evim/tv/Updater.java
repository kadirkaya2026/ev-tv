package com.evim.tv;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * GitHub Releases'ten kendi kendini güncelleme.
 * Son sürümü sorar, APK'yı indirip Android paket yükleyicisine verir;
 * kullanıcı ekrandaki "Güncelle" onayına basınca kurulur.
 */
final class Updater {

    static final String RELEASES_API = "https://api.github.com/repos/kadirkaya2026/ev-tv/releases/latest";
    static final String APK_NAME = "ev-tv.apk";

    interface Listener {
        void onProgress(int percent);

        void onDone(boolean ok, String message);
    }

    private static volatile boolean busy = false;

    private Updater() {
    }

    static String currentVersion() {
        return BuildConfig.VERSION_NAME;
    }

    /** Son sürüm bilgisi: {current, latest, newer, url, notes}. Ağ işi; arka planda çağır. */
    static JSONObject check() throws Exception {
        HttpURLConnection c = open(RELEASES_API);
        JSONObject rel = new JSONObject(readAll(c));
        String tag = rel.optString("tag_name", "");
        String url = null;
        JSONArray assets = rel.optJSONArray("assets");
        if (assets != null) {
            for (int i = 0; i < assets.length(); i++) {
                JSONObject a = assets.getJSONObject(i);
                if (APK_NAME.equals(a.optString("name"))) url = a.optString("browser_download_url");
            }
        }
        String latest = tag.startsWith("v") ? tag.substring(1) : tag;
        JSONObject o = new JSONObject();
        o.put("current", currentVersion());
        o.put("latest", latest);
        o.put("newer", url != null && compare(latest, currentVersion()) > 0);
        o.put("url", url == null ? JSONObject.NULL : url);
        String notes = rel.optString("body", "");
        o.put("notes", notes.length() > 600 ? notes.substring(0, 600) + "…" : notes);
        return o;
    }

    /** İndirir ve yükleyiciye verir. Onay ekranını InstallReceiver açar. */
    static void downloadAndInstall(Context ctx, String apkUrl, Listener l) {
        if (busy) {
            l.onDone(false, "Güncelleme zaten sürüyor.");
            return;
        }
        busy = true;
        PackageInstaller.Session session = null;
        try {
            PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params =
                    new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(ctx.getPackageName());
            int id = pi.createSession(params);
            session = pi.openSession(id);

            HttpURLConnection c = open(apkUrl);
            long total = c.getContentLengthLong();
            try (InputStream in = c.getInputStream();
                 OutputStream out = session.openWrite(APK_NAME, 0, total > 0 ? total : -1)) {
                byte[] buf = new byte[64 * 1024];
                long done = 0;
                int last = -1, r;
                while ((r = in.read(buf)) > 0) {
                    out.write(buf, 0, r);
                    done += r;
                    if (total > 0) {
                        int pct = (int) (done * 100 / total);
                        if (pct != last) {
                            last = pct;
                            l.onProgress(pct);
                        }
                    }
                }
                session.fsync(out);
            }

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(ctx, id,
                    new Intent(ctx, InstallReceiver.class), flags);
            session.commit(pending.getIntentSender());
            session.close();
            session = null;
            l.onDone(true, "İndirildi. Ekrandaki onayda “Güncelle”ye bas.");
        } catch (Exception e) {
            if (session != null) session.abandon();
            l.onDone(false, "Güncelleme indirilemedi: " + e.getMessage());
        } finally {
            busy = false;
        }
    }

    static int compare(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return p < q ? -1 : 1;
        }
        return 0;
    }

    private static int parse(String s) {
        try {
            return Integer.parseInt(s.replaceAll("[^0-9]", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "EvTV-Updater");
        c.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream");
        int code = c.getResponseCode();
        if (code >= 400) throw new IOException("HTTP " + code);
        return c;
    }

    private static String readAll(HttpURLConnection c) throws IOException {
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int r;
            while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
            return b.toString("UTF-8");
        }
    }
}
