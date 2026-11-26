package com.mohamed.khotatiplan;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

public class Alarms {
    static final String PREFS = "kh_alarms", KEY = "list";

    static PendingIntent pi(Context c, int id, String title, String body) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction("com.mohamed.khotatiplan.ALARM");
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("body", body);
        return PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void one(Context c, int id, long at, String title, String body) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent show = new Intent(c, MainActivity.class);
        PendingIntent sp = PendingIntent.getActivity(c, 0, show, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, sp), pi(c, id, title, body));
        } catch (Exception e) {
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(c, id, title, body)); } catch (Exception e2) { }
        }
    }

    static void cancelAll(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(sp.getString(KEY, "[]"));
            for (int k = 0; k < a.length(); k++) {
                JSONObject o = a.getJSONObject(k);
                am.cancel(pi(c, o.getInt("id"), o.optString("title"), o.optString("body")));
            }
        } catch (Exception e) { }
    }

    static int replace(Context c, JSONArray arr) {
        cancelAll(c);
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply();
        return scheduleStored(c);
    }

    static int scheduleStored(Context c) {
        int n = 0; long now = System.currentTimeMillis();
        try {
            JSONArray a = new JSONArray(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
            for (int k = 0; k < a.length(); k++) {
                JSONObject o = a.getJSONObject(k); long at = o.getLong("at");
                if (at > now) { one(c, o.getInt("id"), at, o.optString("title"), o.optString("body")); n++; }
            }
        } catch (Exception e) { }
        return n;
    }
}
