package org.sehat.app;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

/** Plain-Java checks of ReminderPlan (no Android needed): javac -d /tmp/rp app/src/main/java/org/sehat/app/ReminderPlan.java test/ReminderPlanTest.java && java -cp /tmp/rp org.sehat.app.ReminderPlanTest */
public class ReminderPlanTest {
    static int fail = 0, pass = 0;
    static void ok(boolean c, String what) { if (c) pass++; else { fail++; System.out.println("FAIL " + what); } }
    static final long MIN = 60_000L, WIN = 180 * MIN;
    static final TimeZone KABUL = TimeZone.getTimeZone("Asia/Kabul"), TEHRAN = TimeZone.getTimeZone("Asia/Tehran"), NY = TimeZone.getTimeZone("America/New_York");
    // 2026-10-12 07:00 in Kabul (UTC+4:30) = 02:30 UTC
    static final long K7 = 1791772200000L;

    static ReminderPlan.Dose dose(String key, String day, String hm) { return new ReminderPlan.Dose(key, day, hm, 0, "t", "b"); }

    public static void main(String[] a) {
        ok(ReminderPlan.moment("2026-10-12", "07:00", KABUL) == K7, "07:00 in Kabul");
        ok(ReminderPlan.moment("2026-10-12", "07:00", TEHRAN) == K7 + 60 * MIN, "07:00 in Tehran is an hour later (UTC+3:30)");
        ok(ReminderPlan.moment("2026-03-08", "07:00", NY) == 1772967600000L, "07:00 on a summer-time change day");
        ok(ReminderPlan.moment("2026-13-01", "07:00", KABUL) == -1 && ReminderPlan.moment("x", "07:00", KABUL) == -1 && ReminderPlan.moment("2026-10-12", "7:00", KABUL) == -1, "unreadable day or time");

        List<ReminderPlan.Dose> ds = Arrays.asList(dose("a", "2026-10-12", "07:00"), dose("b", "2026-10-12", "18:00"), dose("c", "2026-10-13", "07:00"));
        Set<String> rung = new HashSet<>();
        ReminderPlan.Step s = ReminderPlan.step(ds, rung, K7 - 60 * MIN, WIN, KABUL);
        ok(s.ring.isEmpty() && s.next == K7, "06:00: nothing rings, the alarm is for 07:00");
        s = ReminderPlan.step(ds, rung, K7, WIN, KABUL);
        ok(s.ring.size() == 1 && s.ring.get(0).key.equals("a") && s.next == K7 + 11 * 60 * MIN, "07:00: the morning dose rings; next 18:00");
        ok(ReminderPlan.step(ds, rung, K7 - 20_000L, WIN, KABUL).ring.size() == 1, "an alarm 20 seconds early still rings");
        rung.add("a");
        s = ReminderPlan.step(ds, rung, K7 + MIN, WIN, KABUL);
        ok(s.ring.isEmpty() && s.next == K7 + 11 * 60 * MIN, "a dose rings once");
        // the phone was off from 06:00 to 08:00: on restart the morning dose still rings (3 hours), not after that
        rung.clear();
        ok(ReminderPlan.step(ds, rung, K7 + 60 * MIN, WIN, KABUL).ring.size() == 1, "restart at 08:00: the 07:00 dose rings");
        ok(ReminderPlan.step(ds, rung, K7 + 181 * MIN, WIN, KABUL).ring.isEmpty(), "restart at 10:01: its time is over, no late ring");
        // the time zone changes from Kabul to Tehran: the moment of "07:00" moves with the clock
        s = ReminderPlan.step(ds, rung, K7 + 30 * MIN, WIN, TEHRAN);   // 06:30 in Tehran
        ok(s.ring.isEmpty() && s.next == K7 + 60 * MIN, "Tehran: 07:00 on the new clock");
        // the clock is put back after the dose rang: it does not ring again
        rung.add("a");
        ok(ReminderPlan.step(ds, rung, K7 - 30 * MIN, WIN, KABUL).ring.isEmpty(), "clock put back: no second ring");
        // a dose put off with "Later": a moment, the same in every time zone
        ReminderPlan.Dose later = new ReminderPlan.Dose("a|x", "2026-10-12", "07:00", K7 + 15 * MIN, "t", "b");
        ok(later.time(TEHRAN) == K7 + 15 * MIN && later.time(KABUL) == K7 + 15 * MIN, "Later: 15 minutes after the tap");
        ok(ReminderPlan.step(Arrays.asList(later), new HashSet<>(), K7 + 15 * MIN, WIN, KABUL).ring.size() == 1, "Later rings at its moment");
        s = ReminderPlan.step(Arrays.asList(dose("z", "bad", "07:00")), new HashSet<>(), K7, WIN, KABUL);
        ok(s.ring.isEmpty() && s.next == Long.MAX_VALUE, "an unreadable dose is skipped; no alarm");
        System.out.println(pass + " passed, " + fail + " failed");
        if (fail > 0) System.exit(1);
    }
}
