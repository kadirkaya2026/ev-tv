package com.evim.tv;

import android.content.Context;
import android.content.res.AssetManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ev ağında çalışan küçük HTTP sunucusu. Telefonlar QR ile buraya bağlanıp
 * çizim tahtasına çizer, asistana soru sorar ve API anahtarını girer.
 * Canlı güncellemeler Server-Sent Events (/api/events) ile yayınlanır.
 */
final class LocalServer {

    static final int PORT = 8765;
    private static final int MAX_BODY = 512 * 1024;
    private static final int MAX_POINTS = 300_000;

    interface TvListener {
        void onEvent(String json);
    }

    private static LocalServer instance;

    static synchronized LocalServer get(Context c) {
        if (instance == null) instance = new LocalServer(c.getApplicationContext());
        return instance;
    }

    private final Context ctx;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final List<SseClient> sse = new CopyOnWriteArrayList<>();
    private final Assistant assistant = new Assistant();
    private volatile TvListener tvListener;
    private volatile boolean started;

    /** Çizgiler: id -> {id, who, color, size, pts:[x,y,x,y...]} (0..1 aralığında). */
    private final LinkedHashMap<String, JSONObject> strokes = new LinkedHashMap<>();
    private int pointCount = 0;
    private volatile boolean thinking = false;

    private LocalServer(Context ctx) {
        this.ctx = ctx;
    }

    void setTvListener(TvListener l) {
        tvListener = l;
    }

    synchronized void start() {
        if (started) return;
        started = true;
        Thread t = new Thread(this::acceptLoop, "evtv-server");
        t.setDaemon(true);
        t.start();
        Thread hb = new Thread(this::heartbeatLoop, "evtv-heartbeat");
        hb.setDaemon(true);
        hb.start();
    }

    String phoneUrl() {
        String ip = lanIp();
        return "http://" + (ip == null ? "TV-IP" : ip) + ":" + PORT + "/?k=" + Store.token(ctx);
    }

    // ------------------------------------------------------------------ durum

    synchronized String stateJson() {
        JSONObject o = new JSONObject();
        try {
            JSONArray arr = new JSONArray();
            for (JSONObject s : strokes.values()) arr.put(s);
            o.put("type", "state");
            o.put("strokes", arr);
            JSONArray chat = new JSONArray();
            for (Assistant.Turn t : assistant.history()) {
                chat.put(new JSONObject().put("role", t.role).put("text", t.text));
            }
            o.put("chat", chat);
            o.put("thinking", thinking);
            o.put("hasKey", Store.hasApiKey(ctx));
        } catch (JSONException ignored) {
        }
        return o.toString();
    }

    /** İnternet odasından (Supabase) gelen komutlar; TV arayüzü buraya iletir. */
    void remoteCommand(String json) {
        try {
            JSONObject c = new JSONObject(json);
            switch (c.optString("type")) {
                case "stroke":
                    handleStroke(c);
                    break;
                case "undo":
                    handleUndo(c.optString("who"));
                    break;
                case "clear":
                    clearBoard();
                    break;
                case "ask":
                    askAsync(c.optString("text"));
                    break;
                case "chatReset":
                    resetAssistant();
                    break;
                default:
                    break;
            }
        } catch (JSONException ignored) {
        }
    }

    void clearBoard() {
        synchronized (this) {
            strokes.clear();
            pointCount = 0;
        }
        broadcast("{\"type\":\"clear\"}");
    }

    void resetAssistant() {
        assistant.reset();
        broadcast("{\"type\":\"chatReset\"}");
    }

    void askAsync(String text) {
        final String q = text == null ? "" : text.trim();
        if (q.isEmpty()) return;
        pool.execute(() -> askBlocking(q));
    }

    private String askBlocking(String q) {
        thinking = true;
        broadcast(event("chat", "user", q));
        try {
            String answer = assistant.ask(Store.apiKey(ctx), q);
            broadcast(event("chat", "assistant", answer));
            return answer;
        } catch (IllegalStateException e) {
            broadcast(event("chatError", "error", e.getMessage()));
            return null;
        } finally {
            thinking = false;
            broadcast("{\"type\":\"thinking\",\"value\":false}");
        }
    }

    private static String event(String type, String role, String text) {
        try {
            return new JSONObject().put("type", type).put("role", role).put("text", text).toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    private void broadcast(String json) {
        TvListener l = tvListener;
        if (l != null) l.onEvent(json);
        byte[] msg = ("data: " + json + "\n\n").getBytes(StandardCharsets.UTF_8);
        for (SseClient c : sse) c.send(msg);
    }

    // ------------------------------------------------------------------ HTTP

    private void acceptLoop() {
        while (true) {
            try (ServerSocket ss = new ServerSocket(PORT)) {
                ss.setReuseAddress(true);
                while (true) {
                    Socket s = ss.accept();
                    pool.execute(() -> handle(s));
                }
            } catch (IOException e) {
                // Port meşgulse (ör. eski örnek kapanıyor) biraz bekleyip tekrar dene
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }
    }

    private void heartbeatLoop() {
        byte[] ping = ": ping\n\n".getBytes(StandardCharsets.UTF_8);
        while (true) {
            try {
                Thread.sleep(15000);
            } catch (InterruptedException e) {
                return;
            }
            for (SseClient c : sse) c.send(ping);
        }
    }

    private final class SseClient {
        final Socket socket;
        final OutputStream out;

        SseClient(Socket socket, OutputStream out) {
            this.socket = socket;
            this.out = out;
        }

        void send(byte[] data) {
            synchronized (this) {
                try {
                    out.write(data);
                    out.flush();
                } catch (IOException e) {
                    sse.remove(this);
                    try {
                        socket.close();
                    } catch (IOException ignored) {
                    }
                }
            }
        }
    }

    private void handle(Socket socket) {
        boolean keepOpen = false;
        try {
            socket.setSoTimeout(20000);
            InputStream in = new BufferedInputStream(socket.getInputStream());
            OutputStream out = socket.getOutputStream();

            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String target = parts[1];

            Map<String, String> headers = new HashMap<>();
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int i = line.indexOf(':');
                if (i > 0) headers.put(line.substring(0, i).trim().toLowerCase(), line.substring(i + 1).trim());
            }
            byte[] body = new byte[0];
            String cl = headers.get("content-length");
            if (cl != null) {
                int n = Integer.parseInt(cl);
                if (n > MAX_BODY) {
                    send(out, 413, "text/plain", "too large");
                    return;
                }
                body = new byte[n];
                int read = 0;
                while (read < n) {
                    int r = in.read(body, read, n - read);
                    if (r < 0) break;
                    read += r;
                }
            }

            String path = target;
            Map<String, String> query = new HashMap<>();
            int q = target.indexOf('?');
            if (q >= 0) {
                path = target.substring(0, q);
                for (String kv : target.substring(q + 1).split("&")) {
                    int e = kv.indexOf('=');
                    if (e > 0) query.put(kv.substring(0, e), URLDecoder.decode(kv.substring(e + 1), "UTF-8"));
                }
            }

            // Statik telefon sayfası (kod gerektirmez, sayfa kodu URL'den okur)
            if ("GET".equals(method) && ("/".equals(path) || "/index.html".equals(path))) {
                sendAsset(out, "web/phone.html", "text/html; charset=utf-8");
                return;
            }
            if ("GET".equals(method) && ("/phone.js".equals(path) || "/phone.css".equals(path))) {
                sendAsset(out, "web" + path, path.endsWith(".js")
                        ? "application/javascript; charset=utf-8" : "text/css; charset=utf-8");
                return;
            }

            if (!path.startsWith("/api/")) {
                send(out, 404, "text/plain", "not found");
                return;
            }
            String token = headers.containsKey("x-token") ? headers.get("x-token") : query.get("k");
            if (!Store.token(ctx).equals(token)) {
                send(out, 403, "application/json", "{\"error\":\"Kod hatalı. TV'deki QR'ı yeniden okut.\"}");
                return;
            }

            String bodyStr = new String(body, StandardCharsets.UTF_8);
            switch (method + " " + path) {
                case "GET /api/events": {
                    String head = "HTTP/1.1 200 OK\r\n"
                            + "Content-Type: text/event-stream; charset=utf-8\r\n"
                            + "Cache-Control: no-store\r\n"
                            + "Connection: keep-alive\r\n\r\n";
                    out.write(head.getBytes(StandardCharsets.UTF_8));
                    out.write(("retry: 2000\ndata: " + stateJson() + "\n\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    socket.setSoTimeout(0);
                    sse.add(new SseClient(socket, out));
                    keepOpen = true;
                    return;
                }
                case "POST /api/stroke":
                    handleStroke(new JSONObject(bodyStr));
                    send(out, 200, "application/json", "{\"ok\":true}");
                    return;
                case "POST /api/undo":
                    handleUndo(new JSONObject(bodyStr).optString("who"));
                    send(out, 200, "application/json", "{\"ok\":true}");
                    return;
                case "POST /api/clear":
                    clearBoard();
                    send(out, 200, "application/json", "{\"ok\":true}");
                    return;
                case "POST /api/ask": {
                    String text = new JSONObject(bodyStr).optString("text").trim();
                    if (text.isEmpty()) {
                        send(out, 400, "application/json", "{\"error\":\"Boş soru\"}");
                        return;
                    }
                    socket.setSoTimeout(0);
                    String answer = askBlocking(text);
                    send(out, 200, "application/json",
                            new JSONObject().put("ok", answer != null).put("answer", answer).toString());
                    return;
                }
                case "POST /api/chat/reset":
                    resetAssistant();
                    send(out, 200, "application/json", "{\"ok\":true}");
                    return;
                case "GET /api/config":
                    send(out, 200, "application/json",
                            new JSONObject().put("hasKey", Store.hasApiKey(ctx)).toString());
                    return;
                case "POST /api/config": {
                    String key = new JSONObject(bodyStr).optString("apiKey").trim();
                    Store.setApiKey(ctx, key);
                    broadcast(new JSONObject().put("type", "config").put("hasKey", true).toString());
                    send(out, 200, "application/json", "{\"ok\":true}");
                    return;
                }
                default:
                    send(out, 404, "application/json", "{\"error\":\"not found\"}");
            }
        } catch (JSONException e) {
            try {
                send(socket.getOutputStream(), 400, "application/json", "{\"error\":\"bad json\"}");
            } catch (IOException ignored) {
            }
        } catch (IOException | RuntimeException ignored) {
        } finally {
            if (!keepOpen) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    private void handleStroke(JSONObject s) throws JSONException {
        String id = s.optString("id");
        if (id.isEmpty()) return;
        JSONArray pts = s.optJSONArray("pts");
        if (pts == null) pts = new JSONArray();
        synchronized (this) {
            if (pointCount + pts.length() / 2 > MAX_POINTS) return;
            JSONObject existing = strokes.get(id);
            if (existing == null) {
                existing = new JSONObject();
                existing.put("id", id);
                existing.put("who", s.optString("who"));
                existing.put("color", s.optString("color", "#ffffff"));
                existing.put("size", s.optDouble("size", 0.006));
                existing.put("pts", new JSONArray());
                strokes.put(id, existing);
            }
            JSONArray all = existing.getJSONArray("pts");
            for (int i = 0; i < pts.length(); i++) all.put(pts.getDouble(i));
            pointCount += pts.length() / 2;
        }
        JSONObject ev = new JSONObject();
        ev.put("type", "stroke");
        ev.put("id", id);
        ev.put("who", s.optString("who"));
        ev.put("color", s.optString("color", "#ffffff"));
        ev.put("size", s.optDouble("size", 0.006));
        ev.put("pts", pts);
        broadcast(ev.toString());
    }

    private void handleUndo(String who) throws JSONException {
        String removed = null;
        synchronized (this) {
            List<String> ids = new ArrayList<>(strokes.keySet());
            Collections.reverse(ids);
            for (String id : ids) {
                if (who.equals(strokes.get(id).optString("who"))) {
                    removed = id;
                    pointCount -= strokes.get(id).getJSONArray("pts").length() / 2;
                    strokes.remove(id);
                    break;
                }
            }
        }
        if (removed != null) {
            broadcast(new JSONObject().put("type", "remove").put("id", removed).toString());
        }
    }

    private void sendAsset(OutputStream out, String name, String type) throws IOException {
        AssetManager am = ctx.getAssets();
        try (InputStream is = am.open(name)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int r;
            while ((r = is.read(buf)) > 0) bos.write(buf, 0, r);
            send(out, 200, type, bos.toByteArray());
        }
    }

    private static void send(OutputStream out, int code, String type, String body) throws IOException {
        send(out, code, type, body.getBytes(StandardCharsets.UTF_8));
    }

    private static void send(OutputStream out, int code, String type, byte[] body) throws IOException {
        String status = code == 200 ? "OK" : code == 403 ? "Forbidden" : code == 404 ? "Not Found" : "Error";
        String head = "HTTP/1.1 " + code + " " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') bos.write(c);
            if (bos.size() > 8192) throw new IOException("line too long");
        }
        if (c == -1 && bos.size() == 0) return null;
        return bos.toString("ISO-8859-1");
    }

    /** Ev ağındaki IPv4 adresi (Wi-Fi ya da kablo). */
    static String lanIp() {
        try {
            String fallback = null;
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (Iterator<InetAddress> it = Collections.list(ni.getInetAddresses()).iterator(); it.hasNext(); ) {
                    InetAddress a = it.next();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        if (a.isSiteLocalAddress()) return a.getHostAddress();
                        if (fallback == null) fallback = a.getHostAddress();
                    }
                }
            }
            return fallback;
        } catch (Exception e) {
            return null;
        }
    }
}
