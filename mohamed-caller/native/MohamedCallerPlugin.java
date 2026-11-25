package com.mohamedcaller.app;

import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MohamedCaller",
    permissions = { @Permission(strings = { android.Manifest.permission.READ_CONTACTS }, alias = "contacts") }
)
public class MohamedCallerPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("mc", Context.MODE_PRIVATE);
    }

    private boolean roleHeld() {
        RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
        return rm != null && rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING);
    }

    private JSObject statusObj() {
        JSObject o = new JSObject();
        o.put("role", roleHeld());
        o.put("overlay", Settings.canDrawOverlays(getContext()));
        o.put("contacts", getPermissionState("contacts") == PermissionState.GRANTED);
        return o;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObj());
    }

    @PluginMethod
    public void requestRole(PluginCall call) {
        RoleManager rm = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
        Intent i = rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING);
        startActivityForResult(call, i, "afterActivity");
    }

    @PluginMethod
    public void requestOverlay(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
        startActivityForResult(call, i, "afterActivity");
    }

    @ActivityCallback
    private void afterActivity(PluginCall call, ActivityResult result) {
        call.resolve(statusObj());
    }

    @PluginMethod
    public void requestContacts(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            call.resolve(statusObj());
        } else {
            requestPermissionForAlias("contacts", call, "contactsDone");
        }
    }

    @PermissionCallback
    private void contactsDone(PluginCall call) {
        call.resolve(statusObj());
    }

    @PluginMethod
    public void setData(PluginCall call) {
        prefs().edit().putString("data", call.getData().toString()).apply();
        call.resolve();
    }

    @PluginMethod
    public void getLog(PluginCall call) {
        JSObject o = new JSObject();
        o.put("log", prefs().getString("log", "[]"));
        call.resolve(o);
    }

    @PluginMethod
    public void clearLog(PluginCall call) {
        prefs().edit().putString("log", "[]").apply();
        call.resolve();
    }
}
