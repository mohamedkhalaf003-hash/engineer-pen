package com.mohamed.khotati;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.browser.customtabs.CustomTabsIntent;

/** Icon launcher: opens Khotati in the user's own Chrome (already signed in). */
public class MainActivity extends Activity {
    private static final String HOME = "https://claude.ai/artifact/KMSHrc8ZE5H1MPGmW26ERj";

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Uri u = Uri.parse(HOME);
        try {
            CustomTabsIntent t = new CustomTabsIntent.Builder().setShowTitle(true).build();
            t.intent.setPackage("com.android.chrome");
            t.launchUrl(this, u);
        } catch (Exception e) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
        }
        finish();
    }
}
