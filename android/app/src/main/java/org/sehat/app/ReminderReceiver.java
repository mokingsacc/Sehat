package org.sehat.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.TimeZone;

/**
 * The medicine reminder alarm, and the moments the alarm must be set again from the list kept on the phone: the phone
 * was restarted (alarms do not survive that), its time zone or clock was changed (the next dose is 07:00 on the new
 * clock), the app was updated, or "Alarms and reminders" was allowed (Android 12+).
 */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            try {
                TimeZone.setDefault(null);   // read the phone's new time zone, not the one this process started with
            } catch (Exception ignored) {
            }
        }
        Reminders.run(context.getApplicationContext());
    }
}
