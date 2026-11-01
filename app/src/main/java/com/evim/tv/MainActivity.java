package com.evim.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * Ana ekran. Tüm arayüz assets/web içindeki HTML/JS ile çiziliyor;
 * bu sınıf WebView'i barındırır, kumanda tuşlarını JS'e iletir
 * ve telefon bağlantısı için yerel sunucuyu başlatır.
 */
public class MainActivity extends Activity {

    private static final int REQ_VOICE = 42;

    private WebView web;
    private boolean pageReady = false;

    private final BroadcastReceiver packageReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            AppRepository.invalidate();
            js("window.tv && tv.appsChanged()");
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingVoice) {
                    pendingVoice = false;
                    js("window.tv && tv.key('voice')");
                }
            }
        });
        web.addJavascriptInterface(new Bridge(this), "Android");
        web.loadUrl("file:///android_asset/web/index.html");
        setContentView(web);
        web.requestFocus();

        // Telefon bağlantısı (çizim tahtası + asistan + ayarlar)
        LocalServer server = LocalServer.get(getApplicationContext());
        server.setTvListener(event -> runOnUiThread(() ->
                js("window.tv && tv.serverEvent(" + JSONObject.quote(event) + ")")));
        server.start();

        InstallReceiver.ui = this;
        Speaker.init(this);
        pendingVoice = isVoiceIntent(getIntent());

        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addDataScheme("package");
        registerReceiver(packageReceiver, f);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        js("window.tv && tv.resumed()");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Ana ekran açıkken Home tuşuna basıldı: ana sayfaya dön
        if (Intent.ACTION_MAIN.equals(intent.getAction())) {
            js("window.tv && tv.home()");
        } else if (isVoiceIntent(intent)) {
            js("window.tv && tv.key('voice')");
        }
    }

    private boolean pendingVoice = false;

    /** Kumandanın asistan/mikrofon tuşu sistem tarafından bize yönlendirildiyse */
    private static boolean isVoiceIntent(Intent i) {
        if (i == null || i.getAction() == null) return false;
        String a = i.getAction();
        return Intent.ACTION_ASSIST.equals(a) || Intent.ACTION_VOICE_COMMAND.equals(a)
                || Intent.ACTION_SEARCH_LONG_PRESS.equals(a)
                || "android.speech.action.VOICE_SEARCH_HANDS_FREE".equals(a);
    }

    @Override
    protected void onDestroy() {
        if (InstallReceiver.ui == this) InstallReceiver.ui = null;
        try {
            unregisterReceiver(packageReceiver);
        } catch (IllegalArgumentException ignored) {
        }
        web.destroy();
        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        String name = null;
        switch (code) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                name = "back";
                break;
            case KeyEvent.KEYCODE_MENU:
                name = "menu";
                break;
            case KeyEvent.KEYCODE_SEARCH:
            case KeyEvent.KEYCODE_VOICE_ASSIST:
            case KeyEvent.KEYCODE_ASSIST:
            case KeyEvent.KEYCODE_BUTTON_Y:
                name = "voice";
                break;
            default:
                break;
        }
        if (name != null) {
            // Bu tuşlar uygulamadan çıkmasın; JS karar versin
            if (event.getAction() == KeyEvent.ACTION_UP) {
                js("window.tv && tv.key('" + name + "')");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    void startVoice() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "tr-TR");
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Sorunu söyle");
        try {
            startActivityForResult(i, REQ_VOICE);
        } catch (Exception e) {
            js("window.tv && tv.voiceResult(null)");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VOICE) return;
        String text = null;
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (r != null && !r.isEmpty()) text = r.get(0);
        }
        js("window.tv && tv.voiceResult(" + (text == null ? "''" : JSONObject.quote(text)) + ")");
    }

    /**
     * Tek onaylı güncelleme: izin yoksa izin ekranı; varsa uygulama indirir ve sistem
     * "Güncelle?" onayını gösterir. Bir şey ters giderse tarayıcıyla indirmeye düşer.
     */
    void startUpdate(String apkUrl) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
                updateStatus(false, "Ev TV'ye “bilinmeyen uygulamaları yükleme” izni ver, sonra tekrar Şimdi Güncelle'ye bas.");
            } catch (Exception e) {
                openInBrowser(apkUrl);
            }
            return;
        }
        new Thread(() -> Updater.downloadAndInstall(getApplicationContext(), apkUrl, new Updater.Listener() {
            @Override
            public void onProgress(int percent) {
                runOnUiThread(() -> js("window.tv && tv.updateProgress(" + percent + ")"));
            }

            @Override
            public void onDone(boolean ok, String message) {
                if (ok) {
                    updateStatus(true, message);
                } else {
                    updateStatus(false, message + " Tarayıcıyla indiriliyor…");
                    runOnUiThread(() -> openInBrowser(apkUrl));
                }
            }
        }), "evtv-update").start();
    }

    private void openInBrowser(String apkUrl) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {
            updateStatus(false, "Tarayıcıya ekatalox.com/evtv yazarak indirebilirsin.");
        }
    }

    void updateStatus(boolean ok, String message) {
        runOnUiThread(() -> js("window.tv && tv.updateStatus(" + ok + "," + JSONObject.quote(message) + ")"));
    }

    void js(String code) {
        if (web == null || !pageReady) return;
        web.evaluateJavascript(code, null);
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }
}
