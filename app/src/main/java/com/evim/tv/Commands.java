package com.evim.tv;

import android.app.SearchManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Asistana gelen cümle bir komutsa (ör. "Netflix'i aç", "YouTube'da kedi videoları aç")
 * yapay zekaya sormadan burada yapılır. Komut değilse null döner.
 */
final class Commands {

    private static final Locale TR = new Locale("tr", "TR");
    private static final Pattern OPEN_VERB = Pattern.compile(
            "\\b(aç|ac|açar|açsana|açabilir|başlat|baslat|çalıştır|calistir|gir|oynat)\\b",
            Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern YT_SEARCH = Pattern.compile(
            "(?:youtube|yutup|you tube)\\s*(?:'|’)?\\s*(?:da|de|ta|te|dan|den)\\s+(.+?)\\s+(?:aç|ac|ara|oynat|izle|bul|göster|goster)\\b",
            Pattern.UNICODE_CHARACTER_CLASS);

    private Commands() {
    }

    static String tryHandle(Context ctx, String text) {
        String n = norm(text);
        if (n.isEmpty()) return null;

        // YouTube'da arama
        Matcher yt = YT_SEARCH.matcher(n);
        if (yt.find()) {
            String q = yt.group(1).trim();
            if (!q.isEmpty() && youtubeSearch(ctx, q)) return "YouTube'da “" + q + "” aranıyor.";
        }

        if (!OPEN_VERB.matcher(n).find()) return null;

        // En uzun eşleşen yüklü uygulamayı bul
        JSONArray apps = AppRepository.load(ctx);
        String bestPkg = null, bestLabel = null;
        int bestLen = 0;
        for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (a == null) continue;
            String label = norm(a.optString("label"));
            String[] keys = {label, label.replace(" ", ""), firstWord(label)};
            for (String k : keys) {
                if (k.length() >= 3 && n.contains(k) && k.length() > bestLen) {
                    bestLen = k.length();
                    bestPkg = a.optString("pkg");
                    bestLabel = a.optString("label");
                }
            }
        }
        if (bestPkg == null) return null;
        if (AppRepository.launch(ctx, bestPkg)) return bestLabel + " açılıyor.";
        return bestLabel + " açılamadı.";
    }

    private static boolean youtubeSearch(Context ctx, String q) {
        String[] pkgs = {"com.google.android.youtube.tv", "com.google.android.youtube"};
        for (String p : pkgs) {
            try {
                Intent i = new Intent(Intent.ACTION_SEARCH).setPackage(p)
                        .putExtra(SearchManager.QUERY, q)
                        .putExtra("query", q)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                return true;
            } catch (Exception ignored) {
            }
        }
        try {
            ctx.startActivity(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://www.youtube.com/results?search_query=" + URLEncoder.encode(q, "UTF-8")))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String firstWord(String s) {
        int i = s.indexOf(' ');
        return i > 0 ? s.substring(0, i) : s;
    }

    static String norm(String s) {
        return s == null ? "" : s.toLowerCase(TR)
                .replace('’', ' ').replace('\'', ' ')
                .replaceAll("[^\\p{L}\\p{N}+ ]", " ")
                .replaceAll("\\s+", " ").trim();
    }
}
