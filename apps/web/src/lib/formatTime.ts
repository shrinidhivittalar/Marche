export function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(value: string): string {
  const [hStr, mStr] = value.split(':');
  const hour24 = Number(hStr);
  const minute = Number(mStr);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${period}` : `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

export function formatEventSchedule(
  eventDate: string,
  timingMode: 'fixed' | 'flexible',
  startTime?: string,
  endTime?: string,
): string {
  if (timingMode === 'fixed' && startTime && endTime) {
    return `${eventDate}, ${formatTimeRange(startTime, endTime)}`;
  }
  return `Flexible — complete by ${eventDate}`;
}
