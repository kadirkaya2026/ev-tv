package com.evim.tv;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

/** WebView içindeki arayüzün çağırdığı yerel fonksiyonlar (window.Android). */
public class Bridge {

    private final MainActivity activity;

    Bridge(MainActivity activity) {
        this.activity = activity;
    }

    /** Yüklü uygulamalar: [{pkg,label,banner,icon}] (görseller data: URI). */
    @JavascriptInterface
    public String getApps() {
        return AppRepository.load(activity).toString();
    }

    @JavascriptInterface
    public boolean launch(String pkg) {
        return AppRepository.launch(activity, pkg);
    }

    /** Bağlantıyı uygun uygulamada aç (ör. YouTube fragmanı). */
    @JavascriptInterface
    public boolean openUrl(String url) {
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    @JavascriptInterface
    public void openSettings() {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Settings.ACTION_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException ignored) {
            }
        });
    }

    /** Telefonun açacağı adres ve bağlantı bilgisi. */
    @JavascriptInterface
    public String getConnectInfo() {
        LocalServer s = LocalServer.get(activity);
        JSONObject o = new JSONObject();
        try {
            o.put("url", s.phoneUrl());
            o.put("room", Store.token(activity));
            o.put("hasKey", Store.hasApiKey(activity));
        } catch (JSONException ignored) {
        }
        return o.toString();
    }

    /** Çizim + asistan geçmişi, sayfa ilk açıldığında. */
    @JavascriptInterface
    public String getState() {
        return LocalServer.get(activity).stateJson();
    }

    /** İnternet üzerinden bağlanan telefonların komutları (JSON). */
    @JavascriptInterface
    public void remoteCmd(String json) {
        LocalServer.get(activity).remoteCommand(json);
    }

    @JavascriptInterface
    public void clearBoard() {
        LocalServer.get(activity).clearBoard();
    }

    /** TV'den (kumanda mikrofonu) gelen soru; cevap olay olarak döner. */
    @JavascriptInterface
    public void ask(String text) {
        LocalServer.get(activity).askAsync(text);
    }

    @JavascriptInterface
    public void resetAssistant() {
        LocalServer.get(activity).resetAssistant();
    }

    /** Dokunmatik ekran var mı (telefon/tablet)? */
    @JavascriptInterface
    public boolean isTouch() {
        return activity.getPackageManager().hasSystemFeature("android.hardware.touchscreen");
    }

    /** CORS'suz GET; sonuç tv.httpResult(id, status, body) ile gelir. Yalnız https. */
    @JavascriptInterface
    public void httpGet(String url, String id) {
        new Thread(() -> {
            int status = 0;
            String body = "";
            if (url != null && url.startsWith("https://")) {
                java.net.HttpURLConnection c = null;
                try {
                    c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    c.setRequestProperty("User-Agent", "EvTV");
                    status = c.getResponseCode();
                    java.io.InputStream in = status < 400 ? c.getInputStream() : c.getErrorStream();
                    if (in != null) {
                        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        int r;
                        while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
                        in.close();
                        body = b.toString("UTF-8");
                    }
                } catch (Exception e) {
                    status = 0;
                } finally {
                    if (c != null) c.disconnect();
                }
            }
            final String js = "window.tv && tv.httpResult(" + JSONObject.quote(id) + "," + status + ","
                    + JSONObject.quote(body) + ")";
            activity.runOnUiThread(() -> activity.js(js));
        }, "evtv-http").start();
    }

    @JavascriptInterface
    public String getVersion() {
        return Updater.currentVersion();
    }

    /** Son sürümü sorar; sonuç tv.updateInfo(json) ile gelir. */
    @JavascriptInterface
    public void checkUpdate() {
        new Thread(() -> {
            String json;
            try {
                json = Updater.check().toString();
            } catch (Exception e) {
                json = "{\"error\":" + JSONObject.quote("Sürüm bilgisi alınamadı (" + e.getMessage() + ")") + "}";
            }
            final String out = json;
            activity.runOnUiThread(() -> activity.js("window.tv && tv.updateInfo(" + JSONObject.quote(out) + ")"));
        }, "evtv-check").start();
    }

    @JavascriptInterface
    public void startUpdate(String apkUrl) {
        activity.runOnUiThread(() -> activity.startUpdate(apkUrl));
    }

    @JavascriptInterface
    public void startVoice() {
        activity.runOnUiThread(activity::startVoice);
    }
}
