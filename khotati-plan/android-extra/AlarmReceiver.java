package com.mohamed.khotatiplan;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
        Intent s = new Intent(c, AlarmService.class);
        s.setAction(AlarmService.ACT_START);
        s.putExtra("id", in.getIntExtra("id", 0));
        s.putExtra("title", in.getStringExtra("title"));
        s.putExtra("body", in.getStringExtra("body"));
        try { ContextCompat.startForegroundService(c, s); } catch (Exception e) { }
    }
}
