package com.mohamed.khotatiplan;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "KhAlarm")
public class AlarmPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        try {
            JSArray in = call.getArray("alarms");
            JSONArray out = new JSONArray();
            for (int k = 0; k < in.length(); k++) {
                JSONObject o = in.getJSONObject(k);
                JSONObject x = new JSONObject();
                x.put("id", o.getInt("id")); x.put("at", o.getLong("at"));
                x.put("title", o.optString("title")); x.put("body", o.optString("body"));
                out.put(x);
            }
            int n = Alarms.replace(getContext(), out);
            JSObject r = new JSObject(); r.put("scheduled", n); call.resolve(r);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void test(PluginCall call) {
        Alarms.one(getContext(), 999999, System.currentTimeMillis() + 5000, "🔔 اختبار الألارم", "لو سمعت الصوت فالألارم شغّال");
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext(); JSObject r = new JSObject();
        try { r.put("battery", ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(c.getPackageName())); } catch (Exception e) { r.put("battery", false); }
        try { r.put("notif", ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled()); } catch (Exception e) { r.put("notif", true); }
        try {
            boolean fs = true;
            if (Build.VERSION.SDK_INT >= 34) fs = ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).canUseFullScreenIntent();
            r.put("fullscreen", fs);
        } catch (Exception e) { r.put("fullscreen", true); }
        call.resolve(r);
    }

    private void open(Intent i, PluginCall call) {
        try { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); call.resolve(); }
        catch (Exception e) {
            try { Intent a = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())); a.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(a); call.resolve(); }
            catch (Exception e2) { call.reject(String.valueOf(e2.getMessage())); }
        }
    }

    @PluginMethod
    public void battery(PluginCall call) {
        open(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName())), call);
    }

    @PluginMethod
    public void fullscreen(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) open(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName())), call);
        else call.resolve();
    }
}
