package com.evim.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Bundle;
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
        }
    }

    @Override
    protected void onDestroy() {
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
