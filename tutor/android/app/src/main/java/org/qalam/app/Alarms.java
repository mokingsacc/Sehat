package org.qalam.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The school day's bells when Qalam is closed (C3.1, P23). The page hands its plan through QalamAndroid.setAlarms
 * only on a phone she said is hers, with the school day and alarms on (day.js syncAlarms); anything else cancels.
 * The times are kept in SharedPreferences (times only: no lesson, subject or learner), so AlarmReceiver can ring and
 * set the next one after a restart without the page. The notification says only "Qalam". While the app is on screen
 * the page rings its own bell and no notification is shown.
 */
final class Alarms {
    private Alarms() {
    }

    static final String ACTION_ALARM = "org.qalam.app.BELL";
    static final String CHANNEL = "bells";
    private static final String PREFS = "alarms";
    private static final int NOTE_ID = 1;
    private static final long[] BUZZ = {0, 300, 200, 300};

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** {title, alarms: [{at, kind}]} from the page; null when it cannot be read. */
    static long[] parse(String json) {
        if (json == null || json.isEmpty() || json.length() > 64_000) return null;
        try {
            JSONArray a = new JSONObject(json).optJSONArray("alarms");
            if (a == null) return new long[0];
            long[] out = new long[Math.min(a.length(), AlarmPlan.MAX * 2)];
            for (int i = 0; i < out.length; i++) {
                JSONObject x = a.optJSONObject(i);
                out[i] = x == null ? 0 : x.optLong("at", 0);
            }
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    private static String store(long[] at) {
        StringBuilder b = new StringBuilder();
        for (long t : at) b.append(b.length() == 0 ? "" : ",").append(t);
        return b.toString();
    }

    private static long[] load(SharedPreferences sp) {
        String s = sp.getString("at", "");
        if (s.isEmpty()) return new long[0];
        try {
            String[] p = s.split(",");
            long[] out = new long[p.length];
            for (int i = 0; i < p.length; i++) out[i] = Long.parseLong(p[i]);
            return out;
        } catch (NumberFormatException e) {
            return new long[0];
        }
    }

    /** A new plan from the page: keep it and set the next alarm. */
    static synchronized void save(Context c, String json) {
        long[] at = parse(json);
        if (at == null) return;
        long now = System.currentTimeMillis();
        prefs(c).edit().putString("at", store(AlarmPlan.clean(at, now))).putLong("last", now).apply();
        run(c);
    }

    /** No alarms: "This phone is mine" is no, alarms or the school day are off, or the module was switched off. */
    static synchronized void cancel(Context c) {
        prefs(c).edit().remove("at").remove("last").apply();
        cancelAlarm(c);
        try {
            NotificationManagerCompat.from(c).cancel(NOTE_ID);
        } catch (Exception ignored) {
        }
    }

    /** Ring what is due now and set the next alarm. Called by save() and by AlarmReceiver. */
    static synchronized void run(Context c) {
        SharedPreferences sp = prefs(c);
        long[] at = load(sp);
        long now = System.currentTimeMillis();
        AlarmPlan.Step s = AlarmPlan.step(at, sp.getLong("last", now), now);
        if (s.ring && !MainActivity.onScreen()) post(c);
        sp.edit().putLong("last", Math.max(s.rung, sp.getLong("last", 0))).apply();
        if (s.next == Long.MAX_VALUE) cancelAlarm(c);
        else setAlarm(c, s.next);
    }

    private static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(ACTION_ALARM);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    /** Exact alarms: always before Android 12; on 13+ USE_EXACT_ALARM; on 12 when allowed. Never asked for. */
    static boolean exactAllowed(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        try {
            return am != null && am.canScheduleExactAlarms();
        } catch (Exception e) {
            return false;
        }
    }

    private static void setAlarm(Context c, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmIntent(c);
        try {
            if (exactAllowed(c)) {
                if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
                return;
            }
        } catch (SecurityException ignored) {
            // taken away a moment ago: the inexact way below
        }
        try {
            am.setWindow(AlarmManager.RTC_WAKEUP, at, 5 * AlarmPlan.MIN, pi);   // within 5 minutes, silently (item 15)
        } catch (Exception ignored) {
        }
    }

    private static void cancelAlarm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(c));
    }

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_bells), NotificationManager.IMPORTANCE_HIGH);
        ch.enableVibration(true);
        ch.setVibrationPattern(BUZZ);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    /** The bell: "Qalam" and nothing else, the phone's own sound; a tap opens the app. */
    private static void post(Context c) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        channel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_qalam)
                .setColor(0xFF0D7C7E)
                .setContentTitle(c.getString(R.string.app_name))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setDefaults(NotificationCompat.DEFAULT_SOUND)
                .setVibrate(BUZZ)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(tap);
        try {
            nm.notify(NOTE_ID, b.build());
        } catch (SecurityException ignored) {
            // Android 13+: notifications not allowed; the School day row says so
        }
    }
}
