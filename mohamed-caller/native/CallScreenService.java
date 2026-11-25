package com.mohamedcaller.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telecom.Call;
import android.telecom.CallScreeningService;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

public class CallScreenService extends CallScreeningService {

    private static String digits(String s) {
        return s == null ? "" : s.replaceAll("[^0-9]", "");
    }

    private static boolean same(String a, String b) {
        String x = digits(a), y = digits(b);
        if (x.length() < 7 || y.length() < 7) return x.equals(y) && x.length() > 0;
        int n = Math.min(9, Math.min(x.length(), y.length()));
        return x.substring(x.length() - n).equals(y.substring(y.length() - n));
    }

    private String contactName(String number) {
        try {
            if (checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return null;
            Uri u = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number));
            try (Cursor c = getContentResolver().query(u, new String[] { ContactsContract.PhoneLookup.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) return c.getString(0);
            }
        } catch (Exception e) { }
        return null;
    }

    @Override
    public void onScreenCall(Call.Details details) {
        CallResponse.Builder b = new CallResponse.Builder();
        try {
            if (details.getCallDirection() != Call.Details.DIRECTION_INCOMING) {
                respondToCall(details, b.build());
                return;
            }
            Uri h = details.getHandle();
            String number = h == null ? "" : h.getSchemeSpecificPart();
            SharedPreferences sp = getSharedPreferences("mc", Context.MODE_PRIVATE);
            JSONObject data = new JSONObject(sp.getString("data", "{}"));
            JSONObject st = data.optJSONObject("settings");
            if (st == null) st = new JSONObject();
            JSONArray list = data.optJSONArray("entries");
            if (list == null) list = new JSONArray();

            String kind = "unknown";
            String title = "رقم غريب";
            String sub = number.isEmpty() ? "رقم مخفي" : number;
            boolean block = false;

            String cn = number.isEmpty() ? null : contactName(number);
            JSONObject hit = null;
            for (int i = 0; i < list.length(); i++) {
                JSONObject e = list.getJSONObject(i);
                if (!number.isEmpty() && same(number, e.optString("number"))) { hit = e; break; }
            }
            if (hit != null) {
                String t = hit.optString("type", "unknown");
                String nm = hit.optString("name", "");
                String nt = hit.optString("note", "");
                title = nm.isEmpty() ? number : nm;
                sub = nt.isEmpty() ? number : nt + " • " + number;
                if (t.equals("block")) { kind = "block"; block = true; }
                else if (t.equals("spam")) { kind = "spam"; block = st.optBoolean("blockSpam", true); }
                else { kind = "safe"; }
            } else if (cn != null) {
                kind = "contact";
                title = cn;
                sub = number;
            } else if (number.isEmpty()) {
                kind = "hidden";
                title = "رقم مخفي";
                sub = "المتصل أخفى رقمه";
                block = st.optBoolean("blockHidden", false);
            } else {
                String home = st.optString("home", "+966");
                boolean intl = number.startsWith("+") && !number.startsWith(home);
                if (intl) {
                    kind = "intl";
                    title = "رقم دولي غريب";
                    sub = number;
                    block = st.optBoolean("blockIntl", false);
                } else {
                    kind = "unknown";
                    title = "رقم غير مسجل";
                    sub = number;
                    block = st.optBoolean("blockUnknown", false);
                }
            }

            // log
            JSONObject le = new JSONObject();
            le.put("t", System.currentTimeMillis());
            le.put("n", number);
            le.put("title", title);
            le.put("kind", kind);
            le.put("blocked", block);
            JSONArray old = new JSONArray(sp.getString("log", "[]"));
            JSONArray nw = new JSONArray();
            nw.put(le);
            for (int i = 0; i < old.length() && i < 199; i++) nw.put(old.get(i));
            sp.edit().putString("log", nw.toString()).apply();

            if (block) {
                b.setDisallowCall(true).setRejectCall(true).setSkipNotification(false);
            } else if (st.optBoolean("alert", true) && !kind.equals("contact") && !kind.equals("safe")) {
                showOverlay(title, sub, kind);
            } else if (kind.equals("contact") || kind.equals("safe")) {
                if (st.optBoolean("showKnown", true)) showOverlay(title, sub, kind);
            }
        } catch (Exception e) {
            // on any error let the call through
        }
        respondToCall(details, b.build());
    }

    private void showOverlay(final String title, final String sub, final String kind) {
        if (!Settings.canDrawOverlays(this)) return;
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                try {
                    final WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
                    int color = 0xFFB45309;
                    String tag = "⚠ احذر";
                    if (kind.equals("block") || kind.equals("spam")) { color = 0xFFB91C1C; tag = "⛔ مزعج"; }
                    else if (kind.equals("contact") || kind.equals("safe")) { color = 0xFF15803D; tag = "✔ معروف"; }
                    else if (kind.equals("hidden")) { color = 0xFF475569; tag = "؟ مخفي"; }
                    final LinearLayout l = new LinearLayout(CallScreenService.this);
                    l.setOrientation(LinearLayout.VERTICAL);
                    l.setPadding(48, 32, 48, 32);
                    l.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
                    GradientDrawable g = new GradientDrawable();
                    g.setColor(color);
                    g.setCornerRadius(44f);
                    l.setBackground(g);
                    TextView t0 = new TextView(CallScreenService.this);
                    t0.setText(tag + "  |  محمد كولر");
                    t0.setTextColor(0xCCFFFFFF);
                    t0.setTextSize(13);
                    TextView t1 = new TextView(CallScreenService.this);
                    t1.setText(title);
                    t1.setTextColor(0xFFFFFFFF);
                    t1.setTextSize(24);
                    t1.setTypeface(null, android.graphics.Typeface.BOLD);
                    TextView t2 = new TextView(CallScreenService.this);
                    t2.setText(sub);
                    t2.setTextColor(0xFFFFFFFF);
                    t2.setTextSize(16);
                    l.addView(t0);
                    l.addView(t1);
                    l.addView(t2);
                    final WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                        PixelFormat.TRANSLUCENT);
                    p.gravity = Gravity.TOP;
                    p.y = 140;
                    p.horizontalMargin = 0.03f;
                    wm.addView(l, p);
                    final Handler hh = new Handler(Looper.getMainLooper());
                    final Runnable rm = new Runnable() {
                        @Override
                        public void run() {
                            try { wm.removeView(l); } catch (Exception e) { }
                        }
                    };
                    l.setOnClickListener(new View.OnClickListener() {
                        @Override
                        public void onClick(View v) { hh.post(rm); }
                    });
                    hh.postDelayed(rm, 25000);
                } catch (Exception e) { }
            }
        });
    }
}
