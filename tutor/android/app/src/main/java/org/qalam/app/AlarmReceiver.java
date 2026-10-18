package org.qalam.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.TimeZone;

/**
 * The bell's alarm, and the moments it must be set again from the times kept on the phone: a restart (alarms do not
 * survive it), a clock or time zone change, an update, or exact alarms allowed (Android 12).
 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            try {
                TimeZone.setDefault(null);
            } catch (Exception ignored) {
            }
        }
        Alarms.run(context.getApplicationContext());
    }
}
