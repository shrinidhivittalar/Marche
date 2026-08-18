import React, { useState } from 'react';
import { Mail, Send, Sparkles, UserPlus, UsersRound } from 'lucide-react';
import { Button, Card, Input, Textarea } from '@marche/ui';
import { useApp } from '../../../context/AppContext';
import { useApiResource } from '../../../hooks/useApiResource';
import { referralsApi } from '../../../lib/referrals-api';
import { ApiError } from '../../../lib/api';
import { FreelancersLayout } from './FreelancersLayout';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const ReferFreelancersPage: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken as string;

  const referrals = useApiResource(() => referralsApi.mine(token, 1, 50), [token], {
    enabled: Boolean(token),
  });
  const items = referrals.data?.items ?? [];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setSpecialty('');
    setNote('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !specialty.trim()) {
      setError('Add a name, email, and specialty before sending.');
      return;
    }

    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      await referralsApi.create(token, {
        name: name.trim(),
        email: email.trim(),
        specialty: specialty.trim(),
        note: note.trim() || undefined,
      });
      resetForm();
      await referrals.refetch();
      setStatusMessage('Invite sent.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send this invite.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FreelancersLayout activeItem="Bring freelancers to Marché">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">
              Bring freelancers to Marché
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Invite providers you already trust and keep a record of who you brought in.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary w-fit">
            <Sparkles className="w-3.5 h-3.5" />
            {referrals.data?.total ?? 0} referral{(referrals.data?.total ?? 0) === 1 ? '' : 's'}{' '}
            sent
          </div>
        </div>

        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <UserPlus className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-ink">Refer a provider</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Sends a real invite email to this address.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Name</label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Provider name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Email</label>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Specialty</label>
              <Input
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
                placeholder="Photography, catering, event planning..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Personal note</label>
              <Textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional message for the provider"
              />
            </div>

            {(error || statusMessage) && (
              <p className={`text-xs font-semibold ${error ? 'text-red-600' : 'text-primary'}`}>
                {error || statusMessage}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" icon={Send} disabled={submitting}>
                Send Invite
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-surface-subtle text-ink-muted flex items-center justify-center border border-border">
              <UsersRound className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-ink">Referral history</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Providers you have invited to join Marché.
              </p>
            </div>
          </div>

          {referrals.loading ? (
            <p className="text-xs text-ink-muted py-6 text-center">Loading…</p>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg p-6 text-center text-xs text-ink-muted">
              No referrals yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((referral) => (
                <div key={referral.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{referral.name}</p>
                    <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      {referral.email}
                    </p>
                    <p className="text-xs text-ink mt-2">{referral.specialty}</p>
                    {referral.note && (
                      <p className="text-xs text-ink-muted mt-1 line-clamp-2">{referral.note}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase text-primary border border-primary/20">
                      {referral.status === 'JOINED' ? 'joined' : 'invited'}
                    </span>
                    <p className="text-[11px] text-ink-muted">{formatDate(referral.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </FreelancersLayout>
  );
};
