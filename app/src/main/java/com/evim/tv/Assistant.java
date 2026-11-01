package com.evim.tv;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.UnauthorizedException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.StopReason;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * TV asistanı. Anahtar "sk-ant-" ile başlıyorsa Claude, değilse ChatGPT (OpenAI) kullanılır.
 * Sohbet geçmişi bellekte tutulur.
 */
final class Assistant {

    private static final String MODEL = "claude-opus-5-5";
    private static final int MAX_TURNS = 12;
    private static final String SYSTEM =
            "Sen evdeki bir televizyonda çalışan yardımcı asistansın. Kullanıcı ya kumandaya "
                    + "konuşarak ya da telefonundan yazarak soru soruyor. Cevabın büyük TV ekranında "
                    + "okunacak: Türkçe, sıcak ve kısa yaz (çoğunlukla 1-4 cümle). Markdown, başlık, "
                    + "tablo ya da emoji kullanma; gerekirse kısa düz liste yazabilirsin. Film, dizi, "
                    + "tarif, genel kültür ve gündelik konularda yardımcı ol.";

    static final class Turn {
        final String role; // "user" | "assistant"
        final String text;

        Turn(String role, String text) {
            this.role = role;
            this.text = text;
        }
    }

    // OpenAI: sırayla denenir; hesapta olmayan/kalkmış model atlanır, çalışan hatırlanır
    private static final String[] OPENAI_MODELS = {"gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini", "gpt-4o"};
    private volatile String openAiModel = null;

    private final List<Turn> history = new ArrayList<>();
    private AnthropicClient client;
    private String clientKey;

    private String askOpenAi(String apiKey, String question) {
        JSONArray messages = new JSONArray();
        try {
            messages.put(new JSONObject().put("role", "system").put("content", SYSTEM));
            synchronized (this) {
                int start = Math.max(0, history.size() - MAX_TURNS * 2);
                for (int i = start; i < history.size(); i++) {
                    Turn t = history.get(i);
                    messages.put(new JSONObject().put("role", t.role).put("content", t.text));
                }
            }
            messages.put(new JSONObject().put("role", "user").put("content", question));
        } catch (Exception e) {
            throw new IllegalStateException("Soru hazırlanamadı.");
        }

        String[] models = openAiModel != null ? new String[]{openAiModel} : OPENAI_MODELS;
        String lastError = "ChatGPT cevap veremedi.";
        for (String model : models) {
            int code;
            String body;
            try {
                JSONObject req = new JSONObject().put("model", model).put("messages", messages);
                HttpURLConnection c = (HttpURLConnection) new URL("https://api.openai.com/v1/chat/completions").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(15000);
                c.setReadTimeout(90000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("Authorization", "Bearer " + apiKey);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(req.toString().getBytes(StandardCharsets.UTF_8));
                }
                code = c.getResponseCode();
                InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] buf = new byte[8192];
                    int r;
                    while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
                    in.close();
                }
                body = b.toString("UTF-8");
            } catch (Exception e) {
                throw new IllegalStateException("İnternet bağlantısı kurulamadı.");
            }

            if (code == 200) {
                String answer;
                try {
                    answer = new JSONObject(body).getJSONArray("choices").getJSONObject(0)
                            .getJSONObject("message").optString("content", "").trim();
                } catch (Exception e) {
                    throw new IllegalStateException("ChatGPT'den anlaşılmayan cevap geldi.");
                }
                if (answer.isEmpty()) answer = "(Boş cevap geldi, tekrar dener misin?)";
                openAiModel = model;
                synchronized (this) {
                    history.add(new Turn("user", question));
                    history.add(new Turn("assistant", answer));
                    while (history.size() > MAX_TURNS * 2) history.remove(0);
                }
                return answer;
            }

            String errCode = "";
            try {
                errCode = new JSONObject(body).getJSONObject("error").optString("code", "");
            } catch (Exception ignored) {
            }
            if (code == 401) throw new IllegalStateException("ChatGPT anahtarı geçersiz. Telefondan Ayarlar'dan kontrol et.");
            if ("insufficient_quota".equals(errCode)) {
                throw new IllegalStateException("ChatGPT hesabında bakiye yok. platform.openai.com → Billing'den kredi ekle.");
            }
            if (code == 429) throw new IllegalStateException("Çok sık soru soruldu, biraz sonra tekrar dene.");
            // Model bu hesapta yoksa sıradakini dene
            if (code == 404 || code == 400 || "model_not_found".equals(errCode)) {
                lastError = "ChatGPT modeli kullanılamadı (" + code + ").";
                continue;
            }
            throw new IllegalStateException("ChatGPT şu an cevap veremedi (" + code + ").");
        }
        openAiModel = null;
        throw new IllegalStateException(lastError);
    }

    synchronized List<Turn> history() {
        return new ArrayList<>(history);
    }

    synchronized void reset() {
        history.clear();
    }

    /** Engelleyici çağrı; arka plan iş parçacığından çağrılmalı. */
    String ask(String apiKey, String question) {
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("API anahtarı yok. Telefondan Ayarlar sekmesinde gir.");
        }
        if (!apiKey.startsWith("sk-ant-")) return askOpenAi(apiKey, question);
        MessageCreateParams.Builder b;
        synchronized (this) {
            if (client == null || !apiKey.equals(clientKey)) {
                client = AnthropicOkHttpClient.builder().apiKey(apiKey).build();
                clientKey = apiKey;
            }
            b = MessageCreateParams.builder()
                    .model(MODEL)
                    .maxTokens(16000L)
                    .system(SYSTEM)
                    // Sohbet için düşük efor yeterli ve hızlı
                    .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
                    // Güvenlik sınıflandırıcısı reddederse sunucu başka bir modelle tekrar dener
                    .putAdditionalHeader("anthropic-beta", "server-side-fallback-2026-07-01")
                    .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"));
            int start = Math.max(0, history.size() - MAX_TURNS * 2);
            for (int i = start; i < history.size(); i++) {
                Turn t = history.get(i);
                if (i == start && !"user".equals(t.role)) continue; // ilk mesaj kullanıcıdan olmalı
                if ("user".equals(t.role)) b.addUserMessage(t.text);
                else b.addAssistantMessage(t.text);
            }
            b.addUserMessage(question);
        }

        Message response;
        try {
            response = client.messages().create(b.build());
        } catch (UnauthorizedException e) {
            throw new IllegalStateException("API anahtarı geçersiz. Telefondan Ayarlar'dan kontrol et.");
        } catch (RateLimitException e) {
            throw new IllegalStateException("Çok sık soru soruldu, biraz sonra tekrar dene.");
        } catch (AnthropicServiceException e) {
            throw new IllegalStateException("Claude şu an cevap veremedi (" + e.statusCode() + ").");
        } catch (RuntimeException e) {
            throw new IllegalStateException("İnternet bağlantısı kurulamadı.");
        }

        if (response.stopReason().map(r -> r.equals(StopReason.REFUSAL)).orElse(false)) {
            throw new IllegalStateException("Bu soruya cevap veremiyorum.");
        }
        StringBuilder sb = new StringBuilder();
        response.content().forEach(block -> block.text().ifPresent(t -> sb.append(t.text())));
        String answer = sb.toString().trim();
        if (answer.isEmpty()) answer = "(Boş cevap geldi, tekrar dener misin?)";

        synchronized (this) {
            history.add(new Turn("user", question));
            history.add(new Turn("assistant", answer));
            while (history.size() > MAX_TURNS * 2) history.remove(0);
        }
        return answer;
    }
}
