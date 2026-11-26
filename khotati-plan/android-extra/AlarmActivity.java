package com.mohamed.khotatiplan;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AlarmActivity extends Activity {
    BroadcastReceiver closer = new BroadcastReceiver() { public void onReceive(Context c, Intent i) { finish(); } };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        try { if (Build.VERSION.SDK_INT >= 26) ((KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE)).requestDismissKeyguard(this, null); } catch (Exception e) { }
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.VERTICAL); r.setGravity(Gravity.CENTER); r.setBackgroundColor(Color.parseColor("#101826")); r.setPadding(48, 48, 48, 48);
        TextView ic = new TextView(this); ic.setText("⏰"); ic.setTextSize(72); ic.setGravity(Gravity.CENTER);
        TextView t = new TextView(this); t.setText(getIntent().getStringExtra("title")); t.setTextColor(Color.WHITE); t.setTextSize(30); t.setTypeface(Typeface.DEFAULT_BOLD); t.setGravity(Gravity.CENTER); t.setPadding(0, 24, 0, 12);
        TextView d = new TextView(this); d.setText(getIntent().getStringExtra("body")); d.setTextColor(Color.parseColor("#9fb3c8")); d.setTextSize(20); d.setGravity(Gravity.CENTER); d.setPadding(0, 0, 0, 48);
        Button stop = new Button(this); stop.setText("إيقاف"); stop.setTextSize(24); stop.setBackgroundColor(Color.parseColor("#12a37f")); stop.setTextColor(Color.WHITE);
        Button snz = new Button(this); snz.setText("غفوة 5 دقائق"); snz.setTextSize(20); snz.setBackgroundColor(Color.parseColor("#2a3a52")); snz.setTextColor(Color.WHITE);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 190); lp.setMargins(0, 16, 0, 16);
        stop.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { act(AlarmService.ACT_STOP); } });
        snz.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { act(AlarmService.ACT_SNOOZE); } });
        r.addView(ic); r.addView(t); r.addView(d); r.addView(stop, lp); r.addView(snz, lp);
        setContentView(r);
        IntentFilter f = new IntentFilter("kh.alarm.closed");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(closer, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(closer, f);
    }

    void act(String a) {
        Intent s = new Intent(this, AlarmService.class); s.setAction(a);
        try { startService(s); } catch (Exception e) { }
        finish();
    }

    @Override protected void onDestroy() { try { unregisterReceiver(closer); } catch (Exception e) { } super.onDestroy(); }
}
