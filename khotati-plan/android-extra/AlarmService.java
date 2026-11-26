package com.mohamed.khotatiplan;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public class AlarmService extends Service {
    static final String ACT_START = "kh.start", ACT_STOP = "kh.stop", ACT_SNOOZE = "kh.snooze";
    static final String CH = "kh_alarm_v1";
    static final int NID = 7001;
    MediaPlayer mp; Vibrator vib; PowerManager.WakeLock wl;
    Handler h = new Handler(Looper.getMainLooper());
    Runnable auto = new Runnable() { public void run() { stopAll(); } };
    int curId; String curTitle = "", curBody = "";

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent in, int flags, int startId) {
        String a = in == null ? ACT_START : in.getAction();
        if (ACT_STOP.equals(a)) { stopAll(); return START_NOT_STICKY; }
        if (ACT_SNOOZE.equals(a)) {
            Alarms.one(this, 900000 + (int) (System.currentTimeMillis() / 1000 % 90000), System.currentTimeMillis() + 5 * 60000L, curTitle, curBody);
            stopAll(); return START_NOT_STICKY;
        }
        curId = in != null ? in.getIntExtra("id", 0) : 0;
        curTitle = in != null && in.getStringExtra("title") != null ? in.getStringExtra("title") : "خطتي";
        curBody = in != null && in.getStringExtra("body") != null ? in.getStringExtra("body") : "";
        show();
        play();
        h.removeCallbacks(auto); h.postDelayed(auto, 60000);
        return START_NOT_STICKY;
    }

    void show() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "منبّه خطتي", NotificationManager.IMPORTANCE_HIGH);
            ch.setSound(null, null); ch.enableVibration(false); ch.setBypassDnd(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        int imm = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        Intent ai = new Intent(this, AlarmActivity.class);
        ai.putExtra("title", curTitle); ai.putExtra("body", curBody);
        ai.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent full = PendingIntent.getActivity(this, 1, ai, imm);
        Intent st = new Intent(this, AlarmService.class); st.setAction(ACT_STOP);
        Intent sn = new Intent(this, AlarmService.class); sn.setAction(ACT_SNOOZE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(curTitle).setContentText(curBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(curBody))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true).setAutoCancel(false)
            .setContentIntent(full).setFullScreenIntent(full, true)
            .addAction(0, "إيقاف", PendingIntent.getService(this, 2, st, imm))
            .addAction(0, "غفوة 5 د", PendingIntent.getService(this, 3, sn, imm));
        Notification n = b.build();
        try {
            if (Build.VERSION.SDK_INT >= 29) ServiceCompat.startForeground(this, NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NID, n);
        } catch (Exception e) { try { nm.notify(NID, n); } catch (Exception e2) { } }
    }

    void play() {
        stopSound();
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "khotati:alarm"); wl.acquire(70000);
        } catch (Exception e) { }
        try {
            Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            mp.setDataSource(this, u); mp.setLooping(true); mp.prepare(); mp.start();
        } catch (Exception e) { }
        try {
            vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            long[] p = {0, 700, 500, 700, 500, 1200, 900};
            if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(p, 0)); else vib.vibrate(p, 0);
        } catch (Exception e) { }
    }

    void stopSound() {
        try { if (mp != null) { mp.stop(); mp.release(); } } catch (Exception e) { }
        mp = null;
        try { if (vib != null) vib.cancel(); } catch (Exception e) { }
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) { }
    }

    void stopAll() {
        h.removeCallbacks(auto);
        stopSound();
        try { stopForeground(true); } catch (Exception e) { }
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NID); } catch (Exception e) { }
        sendBroadcast(new Intent("kh.alarm.closed").setPackage(getPackageName()));
        stopSelf();
    }

    @Override public void onDestroy() { stopSound(); super.onDestroy(); }
}
