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
            "(?<![\\p{L}\\p{N}])(aç|ac|açar|açsana|açabilir|başlat|baslat|çalıştır|calistir|gir|oynat)(?![\\p{L}\\p{N}])");
    private static final Pattern YT_SEARCH = Pattern.compile(
            "(?:youtube|yutup|you tube)\\s*(?:'|’)?\\s*(?:da|de|ta|te|dan|den)\\s+(.+?)\\s+(?:aç|ac|ara|oynat|izle|bul|göster|goster)(?![\\p{L}\\p{N}])");

    // "netflix te en popüler filmi aç", "disney de inception ı aç" (kesme işaretleri boşluğa döner)
    private static final Pattern PROVIDER_CONTENT = Pattern.compile(
            "(netflix|prime video|prime|amazon|disney plus|disney\\+|disney|blutv|blu tv|exxen|mubi|tabii|gain)"
                    + "\\s*(?:te|ta|de|da|dan|den)\\s+(.+?)\\s+(?:aç|ac|oynat|izle|göster|goster|bul)(?![\\p{L}\\p{N}])");

    private static final String[][] PROVIDERS = {
            // anahtar kelime, sunucu adı, arama adresi
            {"netflix", "netflix", "https://www.netflix.com/search?q="},
            {"prime", "amazonprime", "https://app.primevideo.com/search?phrase="},
            {"amazon", "amazonprime", "https://app.primevideo.com/search?phrase="},
            {"disney", "disney", "https://www.disneyplus.com/search?q="},
            {"blutv", "blutv", null}, {"blu tv", "blutv", null}, {"exxen", "exxen", null},
            {"mubi", "mubi", null}, {"tabii", "tabii", null}, {"gain", "gain", null},
    };

    private Commands() {
    }

    /** "Netflix'te en popüler filmi aç" / "Netflix'te Inception'ı aç" */
    private static String providerContent(Context ctx, String text) {
        // Başlıklar için uluslararası küçük harf (Inception → inception, ınception değil)
        String n = normRoot(text);
        Matcher m = PROVIDER_CONTENT.matcher(n);
        if (!m.find()) return null;
        String prov = m.group(1), what = m.group(2).trim();
        String[] cfg = null;
        for (String[] p : PROVIDERS) if (prov.startsWith(p[0])) { cfg = p; break; }
        if (cfg == null) return null;

        // Yüklü platform uygulaması
        String pkg = null, label = null;
        JSONArray apps = AppRepository.load(ctx);
        for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (a != null && norm(a.optString("label")).contains(cfg[0])) {
                pkg = a.optString("pkg");
                label = a.optString("label");
                break;
            }
        }
        if (pkg == null) return prov + " bu cihazda yüklü değil.";

        String title;
        boolean popular = what.contains("popüler") || what.contains("populer") || what.contains("trend")
                || what.contains("gündem") || what.contains("en çok");
        if (popular) {
            String type = what.contains("dizi") ? "tv" : "movie";
            title = topTitle(cfg[1], type);
            if (title == null) {
                AppRepository.launch(ctx, pkg);
                return label + " açıldı. Bu haftanın popüler listesine şu an ulaşamadım.";
            }
        } else {
            title = stripSuffixes(what);
            if (title.isEmpty()) return null;
        }

        if (cfg[2] != null) {
            try {
                ctx.startActivity(new Intent(Intent.ACTION_VIEW,
                        Uri.parse(cfg[2] + URLEncoder.encode(title, "UTF-8")))
                        .setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return label + "'te “" + title + "” açılıyor.";
            } catch (Exception ignored) {
                // Uygulama arama bağlantısını desteklemiyor: sadece aç
            }
        }
        AppRepository.launch(ctx, pkg);
        return label + " açıldı. " + (popular ? "Bu haftanın en popülerlerinden: " : "Aranacak: ") + "“" + title + "”.";
    }

    /** ekatalox: platformda bu hafta en popüler yapımın adı (yoksa null). Ağ işi. */
    private static String topTitle(String provider, String type) {
        try {
            java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(
                    "https://www.ekatalox.com/api/evtv/top?provider=" + provider + "&type=" + type).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestProperty("User-Agent", "EvTV");
            if (c.getResponseCode() != 200) return null;
            java.io.InputStream in = c.getInputStream();
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int r;
            while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
            in.close();
            JSONObject o = new JSONObject(b.toString("UTF-8"));
            return o.optBoolean("found") ? o.optString("title", null) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static final java.util.Set<String> SUFFIXES = new java.util.HashSet<>(java.util.Arrays.asList(
            "ı", "i", "u", "ü", "yı", "yi", "yu", "yü", "nı", "ni", "nu", "nü",
            "filmini", "filmi", "film", "dizisini", "dizisi", "dizi", "belgeselini", "belgeseli"));

    private static String stripSuffixes(String s) {
        String[] t = s.split(" ");
        int end = t.length;
        while (end > 0 && SUFFIXES.contains(t[end - 1])) end--;
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < end; i++) {
            if (b.length() > 0) b.append(' ');
            b.append(t[i]);
        }
        return b.toString().trim();
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

        // Platformda belirli/popüler içerik
        String pc = providerContent(ctx, text);
        if (pc != null) return pc;

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

    /** Uluslararası küçük harf: "I" → "i" (Türkçe kuralda "ı" olurdu), "İ" → "i". */
    static String normRoot(String s) {
        if (s == null) return "";
        return s.toLowerCase(Locale.ROOT).replace("i\u0307", "i")
                .replace('’', ' ').replace('\'', ' ')
                .replaceAll("[^\\p{L}\\p{N}+ ]", " ")
                .replaceAll("\\s+", " ").trim();
    }

    static String norm(String s) {
        return s == null ? "" : s.toLowerCase(TR)
                .replace('’', ' ').replace('\'', ' ')
                .replaceAll("[^\\p{L}\\p{N}+ ]", " ")
                .replaceAll("\\s+", " ").trim();
    }
}
