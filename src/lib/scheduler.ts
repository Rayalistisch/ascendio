import { RRule } from "rrule";

export function buildRRule(params: {
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  hour: number;
  minute: number;
  timezone: string;
}): string {
  const freqMap: Record<string, number> = {
    daily: RRule.DAILY,
    weekly: RRule.WEEKLY,
    biweekly: RRule.WEEKLY,
    monthly: RRule.MONTHLY,
  };

  const rule = new RRule({
    freq: freqMap[params.frequency],
    interval: params.frequency === "biweekly" ? 2 : 1,
    byhour: [params.hour],
    byminute: [params.minute],
    bysecond: [0],
    dtstart: new Date(),
  });

  return rule.toString();
}

export function getNextRunDate(rruleStr: string): Date | null {
  try {
    const rule = RRule.fromString(rruleStr);
    const now = new Date();
    const next = rule.after(now, false);
    return next;
  } catch {
    return null;
  }
}

export function getNextRunDateAfter(rruleStr: string, after: Date): Date | null {
  try {
    const rule = RRule.fromString(rruleStr);
    const next = rule.after(after, false);
    return next;
  } catch {
    return null;
  }
}

export function describeSchedule(rruleStr: string): string {
  try {
    const rule = RRule.fromString(rruleStr);
    return rule.toText();
  } catch {
    return "Invalid schedule";
  }
}
