package org.qalam.app;

/**
 * AlarmPlan without Android: javac -d out ../app/src/main/java/org/qalam/app/AlarmPlan.java AlarmPlanTest.java
 * then java -cp out org.qalam.app.AlarmPlanTest (tutor-android.yml runs it before the build).
 */
public final class AlarmPlanTest {
    private static int failed;

    private static void check(boolean ok, String what) {
        System.out.println((ok ? "ok   " : "FAIL ") + what);
        if (!ok) failed++;
    }

    public static void main(String[] args) {
        long now = 1_800_000_000_000L, m = AlarmPlan.MIN;
        long[] at = AlarmPlan.clean(new long[]{now + 30 * m, now + 5 * m, now + 5 * m, now - 60 * m, now + 9L * 24 * 60 * m}, now);
        check(at.length == 2 && at[0] == now + 5 * m && at[1] == now + 30 * m, "sorted, once each, nothing stale or far");
        AlarmPlan.Step s = AlarmPlan.step(at, now, now);
        check(!s.ring && s.next == now + 5 * m, "nothing due yet: the alarm is the next bell");
        s = AlarmPlan.step(at, now, now + 5 * m + 1000);
        check(s.ring && s.rung == now + 5 * m && s.next == now + 30 * m, "a bell due rings, then the next one is set");
        s = AlarmPlan.step(at, now + 5 * m, now + 6 * m);
        check(!s.ring && s.next == now + 30 * m, "a bell rings once");
        s = AlarmPlan.step(at, now, now + 29 * m);
        check(!s.ring && s.rung == now + 5 * m, "a phone that was off does not ring a bell long past");
        s = AlarmPlan.step(at, now + 30 * m, now + 31 * m);
        check(!s.ring && s.next == Long.MAX_VALUE, "after the last bell: no alarm");
        long[] many = new long[500];
        for (int i = 0; i < many.length; i++) many[i] = now + (i + 1) * m;
        check(AlarmPlan.clean(many, now).length == AlarmPlan.MAX, "at most " + AlarmPlan.MAX + " kept");
        check(AlarmPlan.clean(null, now).length == 0, "no plan, no alarms");
        if (failed > 0) {
            System.out.println(failed + " failed");
            System.exit(1);
        }
    }
}
