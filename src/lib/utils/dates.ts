import { formatDistanceToNow, format, isThisWeek, startOfWeek, eachDayOfInterval, endOfWeek } from "date-fns";

export function formatRelativeTime(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatDate(date: Date): string {
  return format(date, "d MMM yyyy");
}

export function formatShortDate(date: Date): string {
  return format(date, "d MMM");
}

export function isOverdue(dueDate: Date): boolean {
  return dueDate < new Date();
}

export function isInactive(lastUpdatedAt: Date, thresholdHours = 48): boolean {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - thresholdHours);
  return lastUpdatedAt < threshold;
}

export function getCurrentWeekDays(): Date[] {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
  return eachDayOfInterval({ start, end });
}

export function getDayLabel(date: Date): string {
  return format(date, "EEEE");
}

export function getShortDayLabel(date: Date): string {
  return format(date, "EEE");
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function isDateThisWeek(date: Date): boolean {
  return isThisWeek(date, { weekStartsOn: 1 });
}
