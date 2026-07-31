import type { EventTimingMode, TimeSlot } from '../types';

export type SlotStatus = 'open' | 'blocked' | 'booked';
export type DayAvailability = Record<TimeSlot, SlotStatus>;

export const DEFAULT_DAY_AVAILABILITY: DayAvailability = {
  Morning: 'open',
  Afternoon: 'open',
  Evening: 'open',
  'Full Day': 'open',
};

const AVAILABILITY_STORAGE_KEY = 'marche_vendor_availability_v1';

export function getVendorAvailability(vendorId: string): Record<string, DayAvailability> {
  const saved = localStorage.getItem(`${AVAILABILITY_STORAGE_KEY}_${vendorId}`);
  return saved ? JSON.parse(saved) : {};
}

export function setVendorAvailability(
  vendorId: string,
  availability: Record<string, DayAvailability>,
): void {
  localStorage.setItem(`${AVAILABILITY_STORAGE_KEY}_${vendorId}`, JSON.stringify(availability));
}

// Maps an event's timing info onto the coarse slot buckets the calendar tracks.
// Flexible-deadline events have no fixed hour, so they reserve the whole day.
export function deriveSlotFromEvent(timingMode: EventTimingMode, startTime?: string): TimeSlot {
  if (timingMode !== 'fixed' || !startTime) return 'Full Day';
  const hour = Number(startTime.split(':')[0]);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

// A slot is unavailable if it's already booked directly, or if a Full Day booking already
// covers the day (or, for a Full Day request, if any individual slot that day is booked).
export function isVendorSlotAvailable(vendorId: string, dateISO: string, slot: TimeSlot): boolean {
  const availability = getVendorAvailability(vendorId);
  const day = availability[dateISO] ?? DEFAULT_DAY_AVAILABILITY;
  if (day[slot] === 'booked') return false;
  if (slot === 'Full Day') {
    return (['Morning', 'Afternoon', 'Evening'] as TimeSlot[]).every((s) => day[s] !== 'booked');
  }
  return day['Full Day'] !== 'booked';
}

// Marks a vendor's calendar slot as booked from a confirmed contract. Never downgrades an
// already-booked slot — a real contract always takes priority over a manual toggle.
export function markVendorSlotBooked(vendorId: string, dateISO: string, slot: TimeSlot): void {
  const availability = getVendorAvailability(vendorId);
  const day = availability[dateISO] ?? DEFAULT_DAY_AVAILABILITY;
  if (day[slot] === 'booked') return;

  setVendorAvailability(vendorId, {
    ...availability,
    [dateISO]: { ...day, [slot]: 'booked' },
  });
}
