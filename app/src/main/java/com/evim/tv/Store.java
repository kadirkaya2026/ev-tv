package com.evim.tv;

import android.content.Context;
import android.content.SharedPreferences;

import java.security.SecureRandom;

/** Küçük kalıcı ayarlar: API anahtarı ve telefon erişim kodu. */
final class Store {

    private static final String PREFS = "evtv";

    private Store() {
    }

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String apiKey(Context c) {
        return p(c).getString("apiKey", "");
    }

    static boolean hasApiKey(Context c) {
        return !apiKey(c).isEmpty();
    }

    static void setApiKey(Context c, String key) {
        p(c).edit().putString("apiKey", key == null ? "" : key.trim()).apply();
    }

    /** Telefon sayfasının kullandığı gizli kod (QR içinde). İlk açılışta üretilir. */
    static synchronized String token(Context c) {
        String t = p(c).getString("token", null);
        if (t == null) {
            final String abc = "abcdefghjkmnpqrstuvwxyz23456789";
            SecureRandom r = new SecureRandom();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 10; i++) sb.append(abc.charAt(r.nextInt(abc.length())));
            t = sb.toString();
            p(c).edit().putString("token", t).apply();
        }
        return t;
    }
}
