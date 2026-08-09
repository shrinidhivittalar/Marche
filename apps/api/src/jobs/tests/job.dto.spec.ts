import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateJobDto } from '../dto/job.dto';

// The cross-field rules are the interesting part of this DTO: each one
// concerns a combination that is individually valid but jointly nonsense.
// They are validated here rather than in the service so a caller is told
// what is wrong alongside any other validation error, in one response.

const base = {
  title: 'Wedding photographer needed',
  description: 'A description long enough to satisfy the validation rules.',
  categoryId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
};

function errorsFor(overrides: Record<string, unknown>): string[] {
  const dto = plainToInstance(CreateJobDto, { ...base, ...overrides });
  return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('CreateJobDto', () => {
  it('accepts the minimum a requirement needs', () => {
    expect(errorsFor({})).toEqual([]);
  });

  describe('event times', () => {
    it('accepts a well-formed 24-hour range', () => {
      expect(
        errorsFor({ eventDate: '2026-09-01', eventStartTime: '18:00', eventEndTime: '23:00' }),
      ).toEqual([]);
    });

    it.each(['6pm', '25:00', '18:60', '8:00', '18.00', ''])('rejects %p as a time', (value) => {
      const errors = errorsFor({ eventDate: '2026-09-01', eventStartTime: value });
      expect(errors.join(' ')).toMatch(/24-hour time/);
    });

    it('rejects times with no event date to belong to', () => {
      // "The event runs 18:00 to 23:00" on no particular day describes
      // nothing, and a provider would assume the date is implied elsewhere.
      const errors = errorsFor({ eventStartTime: '18:00' });
      expect(errors.join(' ')).toMatch(/needs an eventDate/);
    });

    it('rejects an end time before the start', () => {
      const errors = errorsFor({
        eventDate: '2026-09-01',
        eventStartTime: '23:00',
        eventEndTime: '18:00',
      });
      expect(errors.join(' ')).toMatch(/later than eventStartTime/);
    });

    it('rejects an end time equal to the start — a zero-length event', () => {
      const errors = errorsFor({
        eventDate: '2026-09-01',
        eventStartTime: '18:00',
        eventEndTime: '18:00',
      });
      expect(errors.join(' ')).toMatch(/later than eventStartTime/);
    });

    it('compares midnight correctly rather than treating 00:30 as late', () => {
      // Zero-padded HH:MM sorts as a string, which is why the format is
      // pinned. An event ending 00:30 crosses midnight and needs a second
      // date to express, so it is refused rather than silently reordered.
      const errors = errorsFor({
        eventDate: '2026-09-01',
        eventStartTime: '22:00',
        eventEndTime: '00:30',
      });
      expect(errors.join(' ')).toMatch(/later than eventStartTime/);
    });
  });

  describe('proposal deadline', () => {
    it('accepts a deadline before the event', () => {
      expect(errorsFor({ eventDate: '2026-09-01', proposalDeadline: '2026-08-01' })).toEqual([]);
    });

    it('accepts a deadline on the event date — tight, but a real ask', () => {
      expect(errorsFor({ eventDate: '2026-09-01', proposalDeadline: '2026-09-01' })).toEqual([]);
    });

    it('rejects a deadline after the event, which could never be met usefully', () => {
      const errors = errorsFor({ eventDate: '2026-09-01', proposalDeadline: '2026-10-01' });
      expect(errors.join(' ')).toMatch(/cannot be after the event date/);
    });

    it('accepts a deadline with no event date at all', () => {
      // Not every requirement is an event. "Quote me by the 10th" stands
      // on its own.
      expect(errorsFor({ proposalDeadline: '2026-08-01' })).toEqual([]);
    });
  });

  describe('budget', () => {
    it('rejects an inverted range rather than silently matching nothing', () => {
      const errors = errorsFor({ budgetMin: 50000, budgetMax: 10000 });
      expect(errors.join(' ')).toMatch(/budgetMax must be greater than or equal/);
    });

    it('accepts a fixed budget expressed as an equal range', () => {
      // budgetMin === budgetMax is how "fixed" is expressed. It needs no
      // separate mode column; it is the same fact.
      expect(errorsFor({ budgetMin: 25000, budgetMax: 25000 })).toEqual([]);
    });
  });

  describe('deliverables', () => {
    it('accepts a short list', () => {
      expect(errorsFor({ deliverables: ['Edited photos', 'Raw files'] })).toEqual([]);
    });

    it('rejects more than the cap, which would be a description in disguise', () => {
      const errors = errorsFor({ deliverables: Array.from({ length: 21 }, (_, i) => `Item ${i}`) });
      expect(errors.join(' ')).toMatch(/20/);
    });
  });

  describe('field-level authorization', () => {
    // The DTO is the allowlist: what it declares is what a client may set.
    // Validated the way main.ts configures the global pipe, since that —
    // not class-transformer on its own — is what actually rejects an
    // undeclared field.
    it.each(['status', 'clientProfileId', 'publishedAt', 'cancelledAt', 'deletedAt'])(
      'refuses a request carrying %s',
      (field) => {
        const dto = plainToInstance(CreateJobDto, { ...base, [field]: 'x' });
        const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });

        expect(errors.flatMap((e) => Object.values(e.constraints ?? {})).join(' ')).toMatch(
          new RegExp(`${field}.*should not exist`),
        );
      },
    );
  });
});
