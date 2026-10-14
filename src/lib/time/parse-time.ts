/**
 * Normalizes what a person types or picks as a time into 24-hour "HH:mm".
 * Accepts: "16:30", "4:30 pm", "04:30PM", "11 59 am", "1159pm", "4pm", "4 pm",
 * "11.59 am", "0930". Returns null if it cannot be understood.
 */
export function normalizeTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");

  // am/pm suffix (with or without space / dots: "pm", "p.m.", "p")
  const ampmMatch = s.match(/\s*([ap])\.?\s*m?\.?$/);
  const meridiem = ampmMatch ? ampmMatch[1] : null;
  const body = ampmMatch ? s.slice(0, ampmMatch.index).trim() : s;

  let hours: number;
  let minutes: number;

  const sep = body.match(/^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/); // "11:59", "11 59", "11.59"
  const compact = body.match(/^(\d{3,4})$/); // "1159", "930"
  const hourOnly = body.match(/^(\d{1,2})$/); // "4"

  if (sep) {
    hours = Number(sep[1]);
    minutes = Number(sep[2]);
  } else if (compact) {
    const digits = compact[1].padStart(4, "0");
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  } else if (hourOnly) {
    hours = Number(hourOnly[1]);
    minutes = 0;
  } else {
    return null;
  }

  if (minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours !== 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Current IST time rounded up to the next `stepMinutes` (for form defaults), as "HH:mm". */
export function nextIstTime(stepMinutes = 15): string {
  const istMinutes = Math.floor((Date.now() + 330 * 60_000) / 60_000) % (24 * 60);
  const rounded = Math.min(Math.ceil((istMinutes + 1) / stepMinutes) * stepMinutes, 23 * 60 + 59);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}
