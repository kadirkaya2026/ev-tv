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

    @JavascriptInterface
    public void startVoice() {
        activity.runOnUiThread(activity::startVoice);
    }
}
