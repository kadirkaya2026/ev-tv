package com.evim.tv;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Yüklü uygulamaları (TV banner'ı + ikon) bulur ve başlatır. */
final class AppRepository {

    private static JSONArray cache;

    private AppRepository() {
    }

    static synchronized void invalidate() {
        cache = null;
    }

    static synchronized JSONArray load(Context c) {
        if (cache != null) return cache;
        PackageManager pm = c.getPackageManager();
        Map<String, ResolveInfo> found = new LinkedHashMap<>();
        Map<String, Boolean> isTv = new LinkedHashMap<>();

        for (ResolveInfo ri : query(pm, Intent.CATEGORY_LEANBACK_LAUNCHER)) {
            found.put(ri.activityInfo.packageName, ri);
            isTv.put(ri.activityInfo.packageName, true);
        }
        for (ResolveInfo ri : query(pm, Intent.CATEGORY_LAUNCHER)) {
            if (!found.containsKey(ri.activityInfo.packageName)) {
                found.put(ri.activityInfo.packageName, ri);
                isTv.put(ri.activityInfo.packageName, false);
            }
        }

        List<JSONObject> list = new ArrayList<>();
        for (Map.Entry<String, ResolveInfo> e : found.entrySet()) {
            String pkg = e.getKey();
            if (pkg.equals(c.getPackageName())) continue;
            ActivityInfo ai = e.getValue().activityInfo;
            try {
                JSONObject o = new JSONObject();
                o.put("pkg", pkg);
                o.put("label", String.valueOf(e.getValue().loadLabel(pm)));
                o.put("tv", Boolean.TRUE.equals(isTv.get(pkg)));
                Drawable banner = ai.loadBanner(pm);
                if (banner == null) banner = ai.applicationInfo.loadBanner(pm);
                if (banner != null) o.put("banner", toDataUri(banner, 320, 180));
                Drawable icon = ai.loadIcon(pm);
                if (icon != null) o.put("icon", toDataUri(icon, 160, 160));
                list.add(o);
            } catch (JSONException | RuntimeException ignored) {
                // Bozuk görselli bir uygulama tüm listeyi düşürmesin
            }
        }
        Collections.sort(list, (a, b) -> a.optString("label").compareToIgnoreCase(b.optString("label")));
        JSONArray arr = new JSONArray();
        for (JSONObject o : list) arr.put(o);
        cache = arr;
        return arr;
    }

    private static List<ResolveInfo> query(PackageManager pm, String category) {
        Intent i = new Intent(Intent.ACTION_MAIN).addCategory(category);
        List<ResolveInfo> r = pm.queryIntentActivities(i, 0);
        return r == null ? new ArrayList<>() : r;
    }

    static boolean launch(Context c, String pkg) {
        PackageManager pm = c.getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) return false;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            c.startActivity(i);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static String toDataUri(Drawable d, int maxW, int maxH) {
        Bitmap bmp;
        if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) {
            bmp = ((BitmapDrawable) d).getBitmap();
        } else {
            int w = d.getIntrinsicWidth() > 0 ? d.getIntrinsicWidth() : maxW;
            int h = d.getIntrinsicHeight() > 0 ? d.getIntrinsicHeight() : maxH;
            bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(bmp);
            d.setBounds(0, 0, w, h);
            d.draw(cv);
        }
        float scale = Math.min(1f, Math.min((float) maxW / bmp.getWidth(), (float) maxH / bmp.getHeight()));
        if (scale < 1f) {
            bmp = Bitmap.createScaledBitmap(bmp,
                    Math.max(1, Math.round(bmp.getWidth() * scale)),
                    Math.max(1, Math.round(bmp.getHeight() * scale)), true);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
