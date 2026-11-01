package com.evim.tv;

import android.content.Context;
import android.speech.tts.TextToSpeech;

import java.util.Locale;

/** Asistan cevaplarını Türkçe sesli okur (cihazın metin okuma motoruyla). */
final class Speaker {

    private static TextToSpeech tts;
    private static volatile boolean ready = false;

    private Speaker() {
    }

    static synchronized void init(Context c) {
        if (tts != null) return;
        tts = new TextToSpeech(c.getApplicationContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("tr", "TR"));
                ready = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            }
        });
    }

    static void speak(Context c, String text) {
        if (!Store.ttsOn(c) || text == null || text.isEmpty()) return;
        init(c);
        if (ready) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "evtv");
    }

    static void stop() {
        if (tts != null) tts.stop();
    }

    static boolean available() {
        return ready;
    }
}
