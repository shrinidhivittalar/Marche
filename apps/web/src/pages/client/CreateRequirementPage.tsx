import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input, Textarea } from '@marche/ui';
import { EventCategory, EventTimingMode } from '../../types';
import { formatEventSchedule } from '../../lib/formatTime';

const CATEGORIES: EventCategory[] = [
  'Photography',
  'Catering',
  'DJ & Sound',
  'Floral & Decor',
  'Venue',
  'Event Planning',
  'Lighting & FX',
  'Entertainment',
];

function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const CreateRequirementPage: React.FC = () => {
  const { createRequirement, navigate } = useApp();

  const [step, setStep] = useState<number>(1);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('Photography');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('Manhattan, New York, NY');
  const [eventDate, setEventDate] = useState('2026-09-25');
  const [timingMode, setTimingMode] = useState<EventTimingMode>('fixed');
  const [eventStartTime, setEventStartTime] = useState('18:00');
  const [eventEndTime, setEventEndTime] = useState('22:00');
  const [proposalDeadline, setProposalDeadline] = useState('2026-09-10');
  const [budgetMin, setBudgetMin] = useState<number>(2500);
  const [budgetMax, setBudgetMax] = useState<number>(4000);
  const [deliverables, setDeliverables] = useState<string[]>([
    'High-resolution edited digital assets within 48h',
    'On-site production crew & equipment included',
    'Full commercial licensing for social & press',
  ]);
  const [newDeliverableInput, setNewDeliverableInput] = useState('');

  const handleAddDeliverable = () => {
    if (newDeliverableInput.trim()) {
      setDeliverables([...deliverables, newDeliverableInput.trim()]);
      setNewDeliverableInput('');
    }
  };

  const handleRemoveDeliverable = (idx: number) => {
    setDeliverables(deliverables.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;

    const createdReq = createRequirement({
      title,
      category,
      description,
      location,
      eventDate,
      timingMode,
      eventStartTime: timingMode === 'fixed' ? eventStartTime : undefined,
      eventEndTime: timingMode === 'fixed' ? eventEndTime : undefined,
      proposalDeadline,
      budgetMin,
      budgetMax,
      deliverables,
    });

    navigate(`/client/requirements/${createdReq.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/client/dashboard')}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Client Dashboard</span>
        </button>

        <span className="text-xs font-mono uppercase font-semibold text-primary">
          Step {step} of 3
        </span>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Post an Event Requirement
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Specify your event scope, date slot, and budget. Receive tailored proposals from verified talent.
        </p>
      </div>

      {/* Step Indicators */}
      <div className="grid grid-cols-3 gap-2 border-b border-border pb-4">
        <div
          className={`h-1.5 rounded-full transition-all ${
            step >= 1 ? 'bg-primary' : 'bg-border'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all ${
            step >= 2 ? 'bg-primary' : 'bg-border'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all ${
            step >= 3 ? 'bg-primary' : 'bg-border'
          }`}
        />
      </div>

      {/* Step 1: Category & Basic Specs */}
      {step === 1 && (
        <Card className="p-8 space-y-6">
          <h2 className="text-lg font-bold text-ink">1. Service Category & Title</h2>

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-2">
              Event Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                    category === cat
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Requirement Headline / Title
            </label>
            <Input
              type="text"
              placeholder="e.g. Lead Editorial Photographer for NYC Luxury Brand Launch"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Detailed Scope & Specifications
            </label>
            <Textarea
              rows={5}
              placeholder="Describe the atmosphere, attendee expectations, guest count, special technical requirements, and equipment expectations..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl p-4 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white leading-relaxed"
              required
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button
              disabled={!title || !description}
              onClick={() => setStep(2)}
              icon={ArrowRight}
              iconPosition="right"
            >
              Continue to Logistics
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Date, Slot & Location */}
      {step === 2 && (
        <Card className="p-8 space-y-6">
          <h2 className="text-lg font-bold text-ink">2. Event Logistics & Date Slot</h2>

          {/* Timing Mode Toggle */}
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
              <label className="block text-xs font-semibold text-ink mb-1">
                {timingMode === 'fixed' ? 'Event Date' : 'Complete By Date'}
              </label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                min={todayISODate()}
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>

            {timingMode === 'fixed' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Start Time
                  </label>
                  <Input
                    type="time"
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    End Time
                  </label>
                  <Input
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
                  />
                  {eventEndTime <= eventStartTime && (
                    <p className="text-[11px] text-rose-600 mt-1">End time must be after start time.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Proposal Deadline
            </label>
            <Input
              type="date"
              value={proposalDeadline}
              onChange={(e) => setProposalDeadline(e.target.value)}
              min={todayISODate()}
              max={eventDate}
              className="w-full md:w-1/3 bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              Vendors must submit their proposals by this date.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Venue / Location Address
            </label>
            <Input
              type="text"
              placeholder="e.g. Spring Studios, 50 Varick St, New York, NY"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
            />
          </div>

          {/* Deliverables Builder */}
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
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDeliverable())}
                className="flex-1 bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddDeliverable}>
                Add
              </Button>
            </div>

            <div className="space-y-2 pt-2">
              {deliverables.map((item, idx) => (
                <div
                  key={idx}
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

          <div className="flex justify-between pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setStep(1)}>
              Previous
            </Button>
            <Button
              disabled={
                !eventDate ||
                !proposalDeadline ||
                (timingMode === 'fixed' && (!eventStartTime || !eventEndTime || eventEndTime <= eventStartTime))
              }
              onClick={() => setStep(3)}
              icon={ArrowRight}
              iconPosition="right"
            >
              Continue to Budget
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Budget Range & Review */}
      {step === 3 && (
        <Card className="p-8 space-y-6">
          <h2 className="text-lg font-bold text-ink">3. Target Budget & Review</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-bg border border-border rounded-2xl p-6">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Minimum Budget ($)
              </label>
              <Input
                type="number"
                step={100}
                value={budgetMin}
                onChange={(e) => setBudgetMin(Number(e.target.value))}
                className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-xs text-ink font-mono focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Maximum Budget ($)
              </label>
              <Input
                type="number"
                step={100}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
                className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-xs text-ink font-mono focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Summary Box */}
          <div className="p-6 bg-white border border-border rounded-2xl space-y-4">
            <h3 className="text-xs font-mono uppercase font-bold text-primary tracking-wider">
              Requirement Summary
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Title:</span>
                <span className="font-semibold text-ink text-right">{title}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Category:</span>
                <span className="font-medium text-ink">{category}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Logistics:</span>
                <span className="font-medium text-ink">
                  {formatEventSchedule(eventDate, timingMode, eventStartTime, eventEndTime)} — {location}
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Proposal Deadline:</span>
                <span className="font-medium text-ink">{proposalDeadline}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Budget:</span>
                <span className="font-bold text-primary">
                  ${budgetMin.toLocaleString()} - ${budgetMax.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setStep(2)}>
              Previous
            </Button>
            <Button onClick={handleSubmit} icon={Sparkles}>
              Publish Requirement to Marketplace
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
