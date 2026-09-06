import { Calendar as CalendarIcon, CheckCircle2, Clock, MapPin, Trash2 } from 'lucide-react';
import { Button, Card, DatePicker, Input, TimePicker } from '@marche/ui';
import { todayISODate } from '../../../lib/formatTime';
import type { ServiceMode } from '../../../lib/category-templates-api';
import type { CreateJobForm } from './useCreateJobForm';

export function Step4Logistics({ form }: { form: CreateJobForm }) {
  const {
    timingMode,
    setTimingMode,
    eventDate,
    setEventDate,
    eventStartTime,
    setEventStartTime,
    eventEndTime,
    setEventEndTime,
    attemptedNext,
    proposalDeadline,
    setProposalDeadline,
    activeTemplate,
    serviceMode,
    setServiceMode,
    location,
    setLocation,
    newDeliverableInput,
    setNewDeliverableInput,
    handleAddDeliverable,
    deliverables,
    handleRemoveDeliverable,
  } = form;

  return (
    <Card padding="lg" className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
          When and where is this happening?
        </h2>
        <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-lg">
          Set the date slot, proposal deadline and venue, then list what you expect talent to
          deliver. All of these are optional — a requirement can be published without them.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink mb-2">
          How do you want to specify timing?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setTimingMode('fixed')}
            className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
              timingMode === 'fixed'
                ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
            }`}
          >
            I know the exact time
            <span className="block font-normal mt-0.5">e.g. 6:00 PM – 10:00 PM</span>
          </button>
          <button
            type="button"
            onClick={() => setTimingMode('flexible')}
            className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
              timingMode === 'flexible'
                ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
            }`}
          >
            I just need it done by a date
            <span className="block font-normal mt-0.5">No fixed hours, flexible timing</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
            <CalendarIcon className="w-3.5 h-3.5 text-ink-muted" />
            {timingMode === 'fixed' ? 'Event Date' : 'Complete By Date'}
          </label>
          <DatePicker value={eventDate} onChange={setEventDate} min={todayISODate()} />
        </div>

        {timingMode === 'fixed' && (
          <>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                <Clock className="w-3.5 h-3.5 text-ink-muted" />
                Start Time
              </label>
              <TimePicker value={eventStartTime} onChange={setEventStartTime} />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                <Clock className="w-3.5 h-3.5 text-ink-muted" />
                End Time
              </label>
              <TimePicker
                value={eventEndTime}
                onChange={setEventEndTime}
                aria-invalid={attemptedNext && eventEndTime <= eventStartTime}
              />
              {attemptedNext && eventEndTime <= eventStartTime && (
                <p className="text-[11px] text-destructive mt-1 font-medium">
                  End time must be after start time.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {timingMode === 'fixed' && !eventDate && (
        // Times need a date to belong to, which the API enforces too.
        <p className="text-[11px] text-ink-muted">Set an event date to save the hours with it.</p>
      )}

      <div>
        <label className="block text-xs font-semibold text-ink mb-1">Proposal Deadline</label>
        <DatePicker
          value={proposalDeadline}
          onChange={setProposalDeadline}
          min={todayISODate()}
          max={eventDate || undefined}
          className="w-full md:w-1/3"
        />
        <p className="text-[11px] text-ink-muted mt-1">
          Providers must submit their proposals by this date.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink mb-2">
          How will this be delivered?
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {(activeTemplate && activeTemplate.allowedModes.length > 0
            ? activeTemplate.allowedModes
            : (['ONSITE', 'REMOTE', 'HYBRID'] as ServiceMode[])
          ).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`service-mode-${mode}`}
              onClick={() => setServiceMode(mode)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                serviceMode === mode
                  ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                  : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
          <MapPin className="w-3.5 h-3.5 text-ink-muted" />
          Venue / Location Address
          {activeTemplate?.locationRequired && <span className="text-destructive">*</span>}
        </label>
        <Input
          type="text"
          placeholder="e.g. The Oberoi, Nariman Point, Mumbai"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          aria-invalid={attemptedNext && activeTemplate?.locationRequired && !location.trim()}
          data-testid="job-location-input"
        />
        {attemptedNext && activeTemplate?.locationRequired && !location.trim() && (
          <p className="text-[11px] text-destructive mt-1 font-medium">
            This category requires a location.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold text-ink">
          Required Deliverables Checklist
        </label>

        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Add a required deliverable item..."
            value={newDeliverableInput}
            onChange={(e) => setNewDeliverableInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddDeliverable();
              }
            }}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleAddDeliverable}>
            Add
          </Button>
        </div>

        <div className="space-y-2 pt-2">
          {deliverables.map((item, idx) => (
            <div
              key={`${item}-${idx}`}
              className="flex items-center justify-between p-2.5 bg-bg border border-border rounded-xl text-xs text-ink"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                {item}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveDeliverable(idx)}
                className="text-zinc-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
