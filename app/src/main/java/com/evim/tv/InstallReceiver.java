package com.evim.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Paket yükleyicinin sonucu: onay gerekiyorsa sistemin "Güncelle" ekranını açar. */
public class InstallReceiver extends BroadcastReceiver {

    /** Arayüze durum iletmek için (MainActivity ayarlar). */
    static volatile MainActivity ui;

    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirm);
            }
            return;
        }
        MainActivity a = ui;
        if (a == null) return;
        if (status == PackageInstaller.STATUS_SUCCESS) {
            a.updateStatus(true, "Güncellendi.");
        } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
            a.updateStatus(false, "Güncelleme iptal edildi.");
        } else if (status == PackageInstaller.STATUS_FAILURE_CONFLICT) {
            a.updateStatus(false, "Kurulamadı: yüklü sürüm farklı anahtarla imzalı. Bir kez kaldırıp yeniden kurman gerekiyor.");
        } else {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            a.updateStatus(false, "Kurulamadı" + (msg != null ? ": " + msg : "."));
        }
    }
}
