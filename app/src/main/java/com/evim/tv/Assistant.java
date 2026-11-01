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

import java.util.ArrayList;
import java.util.List;

/** Claude ile konuşan TV asistanı. Sohbet geçmişi bellekte tutulur. */
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

    private final List<Turn> history = new ArrayList<>();
    private AnthropicClient client;
    private String clientKey;

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
