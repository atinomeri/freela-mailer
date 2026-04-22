const TBILISI_OFFSET_MINUTES = 4 * 60;
const TBILISI_OFFSET_MS = TBILISI_OFFSET_MINUTES * 60_000;

function toTbilisiShifted(date: Date): Date {
  return new Date(date.getTime() + TBILISI_OFFSET_MS);
}

function fromTbilisiShifted(shifted: Date): Date {
  return new Date(shifted.getTime() - TBILISI_OFFSET_MS);
}

export function parseDailySendTime(value: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function deriveDailySendTimeFromDate(date: Date): string {
  const shifted = toTbilisiShifted(date);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function nextDailyRunFrom(now: Date, dailySendTime: string): Date {
  const parsed = parseDailySendTime(dailySendTime);
  if (!parsed) {
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
  }

  const shiftedNow = toTbilisiShifted(now);
  const candidateShifted = new Date(shiftedNow);
  candidateShifted.setUTCHours(parsed.hour, parsed.minute, 0, 0);
  if (candidateShifted <= shiftedNow) {
    candidateShifted.setUTCDate(candidateShifted.getUTCDate() + 1);
  }
  return fromTbilisiShifted(candidateShifted);
}

export function nextDailyRunAfter(currentScheduledAt: Date, dailySendTime?: string | null): Date {
  const nextShifted = toTbilisiShifted(currentScheduledAt);
  nextShifted.setUTCDate(nextShifted.getUTCDate() + 1);

  if (dailySendTime) {
    const parsed = parseDailySendTime(dailySendTime);
    if (parsed) {
      nextShifted.setUTCHours(parsed.hour, parsed.minute, 0, 0);
      return fromTbilisiShifted(nextShifted);
    }
  }

  nextShifted.setUTCSeconds(0, 0);
  return fromTbilisiShifted(nextShifted);
}
