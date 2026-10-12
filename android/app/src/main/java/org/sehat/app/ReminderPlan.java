package org.sehat.app;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

/**
 * Which medicine reminders ring now, and when the next one is. Plain Java (no Android), so test/ReminderPlanTest.java
 * can check it on a computer.
 *
 * A dose is a calendar day ("2026-10-12") and a time of day ("07:00") of the phone's own clock. Its moment is worked out
 * only when it is needed, in the phone's time zone of that moment, so after a time zone change or a clock change the
 * phone still rings at 07:00 on its own clock. A dose put off with "Later" is a moment instead (at), 15 minutes after the
 * tap.
 */
final class ReminderPlan {
    private ReminderPlan() {
    }

    static final class Dose {
        final String key, day, hm, title, body;
        final long at;   // > 0: a moment (a dose put off with "Later"); otherwise day + hm

        Dose(String key, String day, String hm, long at, String title, String body) {
            this.key = key;
            this.day = day;
            this.hm = hm;
            this.at = at;
            this.title = title;
            this.body = body;
        }

        /** The moment of this dose in the given time zone, or -1 when its day or time is not readable. */
        long time(TimeZone tz) {
            if (at > 0) return at;
            return moment(day, hm, tz);
        }
    }

    /** "2026-10-12" and "07:00" in a time zone, as milliseconds; -1 when not readable. */
    static long moment(String day, String hm, TimeZone tz) {
        if (day == null || hm == null || day.length() != 10 || hm.length() != 5 || day.charAt(4) != '-' || day.charAt(7) != '-' || hm.charAt(2) != ':') return -1;
        try {
            int y = Integer.parseInt(day.substring(0, 4)), mo = Integer.parseInt(day.substring(5, 7)), d = Integer.parseInt(day.substring(8, 10));
            int h = Integer.parseInt(hm.substring(0, 2)), mi = Integer.parseInt(hm.substring(3, 5));
            if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return -1;
            Calendar c = Calendar.getInstance(tz);
            c.clear();
            c.setLenient(true);
            c.set(y, mo - 1, d, h, mi, 0);
            return c.getTimeInMillis();
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    static final class Step {
        final List<Dose> ring = new ArrayList<>();   // due now and not rung yet
        long next = Long.MAX_VALUE;                  // the next alarm (Long.MAX_VALUE: none)
    }

    /** Small slack so an alarm that wakes a moment early still rings its dose. */
    static final long EARLY_MS = 30_000L;

    /**
     * The doses due at {@code now} (their time has come and their window of {@code windowMs} is not over) that have not
     * rung yet, and the time of the next dose after now. A dose whose window is over is never rung (the phone was off
     * for longer than that, or the clock was put far forward).
     */
    static Step step(List<Dose> doses, Set<String> rung, long now, long windowMs, TimeZone tz) {
        Step s = new Step();
        for (Dose d : doses) {
            if (d == null || d.key == null || rung.contains(d.key)) continue;
            long t = d.time(tz);
            if (t <= 0) continue;
            if (t <= now + EARLY_MS) {
                if (now < t + windowMs) s.ring.add(d);
            } else if (t < s.next) {
                s.next = t;
            }
        }
        return s;
    }
}
