package org.qalam.app;

import java.util.Arrays;

/**
 * The school day's alarms as plain times (no Android here, so android/test/AlarmPlanTest.java runs with javac alone).
 * The page (app/js/day.js alarmPlan) sends the next seven days: a wake-up 30 minutes before the start and a bell at
 * each period. One alarm is set at a time, the next one; when it rings, everything due since the last ring counts as
 * rung, and only a bell at most LATE ms old makes a sound (a phone that was off does not ring yesterday's bells).
 */
final class AlarmPlan {
    private AlarmPlan() {
    }

    static final long MIN = 60_000L;
    static final long LATE = 10 * MIN;
    static final int MAX = 200;                       // seven days of periods, with room
    static final long AHEAD = 8L * 24 * 60 * MIN;     // nothing more than eight days away

    /** What to do now: whether to ring, the newest time now rung, and the next alarm (Long.MAX_VALUE: none). */
    static final class Step {
        final boolean ring;
        final long rung;
        final long next;

        Step(boolean ring, long rung, long next) {
            this.ring = ring;
            this.rung = rung;
            this.next = next;
        }
    }

    /** The times kept: sorted, each once, not long past and not more than eight days ahead, at most MAX. */
    static long[] clean(long[] at, long now) {
        if (at == null) return new long[0];
        long[] keep = new long[at.length];       // no streams: they need Android 7, and the app runs from Android 5
        int n = 0;
        for (long t : at) if (t > now - LATE && t <= now + AHEAD) keep[n++] = t;
        Arrays.sort(keep, 0, n);
        int m = 0;
        for (int i = 0; i < n; i++) if (m == 0 || keep[i] != keep[m - 1]) keep[m++] = keep[i];
        return Arrays.copyOf(keep, Math.min(m, MAX));
    }

    static Step step(long[] at, long last, long now) {
        boolean ring = false;
        long rung = last;
        long next = Long.MAX_VALUE;
        for (long t : at) {
            if (t <= last) continue;
            if (t <= now) {
                rung = Math.max(rung, t);
                if (now - t <= LATE) ring = true;
            } else if (t < next) {
                next = t;
            }
        }
        return new Step(ring, rung, next);
    }
}
