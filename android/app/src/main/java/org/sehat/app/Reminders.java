package org.sehat.app;

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

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

/**
 * Medicine reminders that ring when the app is closed (js/family.js sends the list through FHBAndroid.setReminders).
 * The list is kept in SharedPreferences, so ReminderReceiver can ring and set the next alarm after a restart, a time
 * zone change or a clock change without the page. One alarm at a time: the next dose; when it rings, every dose due then
 * gets its notification and the alarm moves to the next one. When the app is on the screen its own reminder (a spoken
 * pop-up) wins and no notification is shown.
 */
final class Reminders {
    private Reminders() {
    }

    static final String ACTION_ALARM = "org.sehat.app.REMIND";
    static final String EXTRA_DOSE = "org.sehat.app.dose";
    static final String CHANNEL = "medicine";
    private static final String PREFS = "reminders";
    private static final int NOTE_ID = 7;           // with the dose key as the tag
    private static final long MIN = 60_000L;
    private static final long[] BUZZ = {0, 400, 250, 400, 250, 600};

    private static final class Plan {
        final List<ReminderPlan.Dose> doses = new ArrayList<>();
        long windowMs = 180 * MIN;
        String channel = "Medicine reminders · یادآوری دوا";
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The page's list: {v, win (minutes), chan, items: [{k, d, hm, at, t, b}]}; null when it cannot be read. */
    private static Plan parse(String json) {
        if (json == null || json.isEmpty()) return null;
        try {
            JSONObject o = new JSONObject(json);
            Plan p = new Plan();
            int win = o.optInt("win", 180);
            if (win > 0 && win <= 24 * 60) p.windowMs = win * MIN;
            String ch = o.optString("chan", "");
            if (!ch.isEmpty()) p.channel = ch.length() > 60 ? ch.substring(0, 60) : ch;
            JSONArray a = o.optJSONArray("items");
            if (a != null) for (int i = 0; i < a.length() && i < 400; i++) {
                JSONObject x = a.optJSONObject(i);
                if (x == null) continue;
                String k = x.optString("k", "");
                if (k.isEmpty() || k.length() > 120) continue;
                p.doses.add(new ReminderPlan.Dose(k, x.optString("d", ""), x.optString("hm", ""), x.optLong("at", 0),
                        clip(x.optString("t", ""), 120), clip(x.optString("b", ""), 300)));
            }
            return p;
        } catch (Exception e) {
            return null;
        }
    }

    private static String clip(String s, int n) {
        return s.length() > n ? s.substring(0, n) : s;
    }

    private static Set<String> set(SharedPreferences sp, String name) {
        return new HashSet<>(sp.getStringSet(name, Collections.<String>emptySet()));   // a copy: the stored set must not change
    }

    /** A new list from the page: keep it, take away notifications of doses no longer in it (taken, "Later", deleted), ring and set the alarm. */
    static synchronized void save(Context c, String json) {
        Plan p = parse(json);
        if (p == null) return;
        SharedPreferences sp = prefs(c);
        Set<String> keys = new HashSet<>();
        for (ReminderPlan.Dose d : p.doses) keys.add(d.key);
        Set<String> posted = set(sp, "posted"), rung = set(sp, "rung");
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        for (String k : posted) if (!keys.contains(k)) {
            try {
                nm.cancel(k, NOTE_ID);
            } catch (Exception ignored) {
            }
        }
        posted.retainAll(keys);
        rung.retainAll(keys);
        sp.edit().putString("list", json).putStringSet("posted", posted).putStringSet("rung", rung).apply();
        channel(c, p.channel);
        run(c);
    }

    /** Rings what is due now (once per dose) and sets the alarm for the next dose. Called by the page and by ReminderReceiver. */
    static synchronized void run(Context c) {
        SharedPreferences sp = prefs(c);
        Plan p = parse(sp.getString("list", null));
        if (p == null || p.doses.isEmpty()) {
            cancelAlarm(c);
            return;
        }
        long now = System.currentTimeMillis();
        Set<String> rung = set(sp, "rung"), posted = set(sp, "posted");
        ReminderPlan.Step s = ReminderPlan.step(p.doses, rung, now, p.windowMs, TimeZone.getDefault());
        if (!s.ring.isEmpty()) {
            boolean onScreen = MainActivity.onScreen();
            for (ReminderPlan.Dose d : s.ring) {
                rung.add(d.key);
                if (!onScreen && post(c, p, d, now)) posted.add(d.key);
            }
            if (onScreen) MainActivity.remindInApp();   // the app's own reminder wins: no second alert
            sp.edit().putStringSet("rung", rung).putStringSet("posted", posted).apply();
        }
        if (s.next == Long.MAX_VALUE) cancelAlarm(c);
        else setAlarm(c, s.next);
    }

    /* ---------- the alarm ---------- */
    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_ALARM);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    private static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    /** Exact when allowed (always before Android 12; on 12+ when "Alarms and reminders" is allowed), otherwise a few minutes late at most. */
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
                if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);   // rings even when the phone is asleep (Doze)
                else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
                return;
            }
        } catch (SecurityException ignored) {
            // the permission was taken away a moment ago: fall through to the inexact way
        }
        inexact(am, at, pi);
    }

    /** Without the exact-alarm permission: within about 10 minutes. Doze (Android 6+) would hold a plain window for hours, so there it is "allow while idle". */
    private static void inexact(AlarmManager am, long at, PendingIntent pi) {
        try {
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setWindow(AlarmManager.RTC_WAKEUP, at, 10 * MIN, pi);
        } catch (Exception ignored) {
        }
    }

    private static void cancelAlarm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(c));
    }

    /* ---------- the notification ---------- */
    /** The "Medicine reminders" channel (Android 8+): high importance, the phone's notification sound, vibration. */
    static void channel(Context c, String name) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, name == null || name.isEmpty() ? "Medicine reminders" : name, NotificationManager.IMPORTANCE_HIGH);
        ch.enableVibration(true);
        ch.setVibrationPattern(BUZZ);
        ch.setShowBadge(true);
        nm.createNotificationChannel(ch);   // only the name changes when it already exists (the family's choices are kept)
    }

    private static boolean post(Context c, Plan p, ReminderPlan.Dose d, long now) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return false;
        channel(c, p.channel);
        Intent open = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .putExtra(EXTRA_DOSE, d.key)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, d.key.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
        long when = d.time(TimeZone.getDefault());
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_medicine)
                .setColor(0xFFB6322D)
                .setContentTitle(d.title.isEmpty() ? "صحت · Sehat" : d.title)
                .setContentText(d.body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(d.body))
                .setWhen(when > 0 ? when : now)
                .setShowWhen(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)          // Android 7 and older: sound and a heads-up
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_LIGHTS)
                .setVibrate(BUZZ)
                .setAutoCancel(true)
                .setContentIntent(tap);
        try {
            nm.notify(d.key, NOTE_ID, b.build());
            return true;
        } catch (SecurityException e) {   // Android 13+: notifications not allowed
            return false;
        }
    }

    /** Takes the notification of one dose away (its notification was tapped). */
    static void dismiss(Context c, String key) {
        if (key == null) return;
        try {
            NotificationManagerCompat.from(c).cancel(key, NOTE_ID);
        } catch (Exception ignored) {
        }
    }
}
