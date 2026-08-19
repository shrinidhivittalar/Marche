import React, { useState } from 'react';
import { ArrowLeft, BadgeCheck, Handshake, Heart, MapPin, Star } from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { Modal } from '../../components/common/Modal';
import { marketplaceApi, profilesApi, type ApiProfile } from '../../lib/marketplace-api';
import { reviewsApi } from '../../lib/reviews-api';
import { savedProvidersApi } from '../../lib/saved-providers-api';
import { directContractsApi } from '../../lib/direct-contracts-api';
import { ApiError } from '../../lib/api';

// The page a client lands on after finding someone in the marketplace, and
// the destination of the whole discovery journey. It previously rendered
// five separate mock fixtures — work history, portfolio, project catalog,
// testimonials, employment history — so every search led somewhere fake.
//
// Nothing here is mock. Anything the API cannot supply yet is either
// omitted or labelled as unavailable, rather than filled with invented
// numbers that would read as real.

interface PublicProfile extends ApiProfile {
  role?: string;
  verified?: boolean;
  statistics?: { completedProjects: number; averageRating: number | null; totalReviews: number };
}

export const PublicProfilePage: React.FC<{ id: string }> = ({ id }) => {
  const { accessToken, currentUser, goBack, navigate, authLoading } = useApp();
  const token = accessToken as string;

  // /profiles/:id requires a session; /u/:username is public. The id route
  // is the authenticated one, so the request waits for auth to settle
  // rather than firing a guaranteed 401 on first paint.
  const profile = useApiResource<PublicProfile>(
    () => profilesApi.byId(accessToken as string, id) as Promise<PublicProfile>,
    [accessToken, id],
    { enabled: !!accessToken },
  );

  // Public — no token, matching reviewsApi's own public endpoints. Keyed on
  // the profile id (not the route's :id, which may be a username on the
  // /u/ route this component doesn't serve, but the id here always resolves
  // through profilesApi.byId first regardless).
  const profileId = profile.data?.id;
  const reviewStats = useApiResource(
    () => reviewsApi.statsForProfile(profileId as string),
    [profileId],
    { enabled: Boolean(profileId) },
  );
  const reviews = useApiResource(
    () => reviewsApi.forProfile(profileId as string, 1, 10),
    [profileId],
    { enabled: Boolean(profileId) },
  );

  // Only a client viewing a provider's profile can save it — the backend
  // enforces the same rule (SavedProvidersService.save), this just avoids
  // showing a button that would 403.
  const canSave = currentUser.role === 'client' && profile.data?.role === 'PROVIDER';
  const isSaved = useApiResource(() => savedProvidersApi.isSaved(token, id), [token, id, canSave], {
    enabled: Boolean(token && canSave),
  });
  const [savePending, setSavePending] = useState(false);

  const handleToggleSave = async () => {
    setSavePending(true);
    try {
      if (isSaved.data?.saved) {
        await savedProvidersApi.unsave(token, id);
      } else {
        await savedProvidersApi.save(token, id);
      }
      await isSaved.refetch();
    } finally {
      setSavePending(false);
    }
  };

  // Same eligibility as Save — a client hiring a provider they already
  // know, skipping the public job posting. Reuses the marketplace category
  // taxonomy rather than inventing a second one for this one form.
  const canHireDirectly = canSave;
  const categories = useApiResource(() => marketplaceApi.categories(), [], {
    enabled: canHireDirectly,
  });
  const leafCategories = (categories.data ?? []).flatMap((parent) =>
    (parent.children ?? []).map((child) => ({ ...child, parentName: parent.name })),
  );

  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [hireCategoryId, setHireCategoryId] = useState('');
  const [hireTitle, setHireTitle] = useState('');
  const [hireDescription, setHireDescription] = useState('');
  const [hirePrice, setHirePrice] = useState('');
  const [hireDeliveryDays, setHireDeliveryDays] = useState('');
  const [hireError, setHireError] = useState<string | null>(null);
  const [hiring, setHiring] = useState(false);

  const handleCreateDirectContract = async () => {
    setHireError(null);
    if (!hireCategoryId) {
      setHireError('Choose a category.');
      return;
    }
    if (hireTitle.trim().length < 3) {
      setHireError('Add a short title.');
      return;
    }
    if (hireDescription.trim().length < 20) {
      setHireError('Add at least a couple of sentences describing the work.');
      return;
    }
    const price = Number(hirePrice);
    const deliveryDays = Number(hireDeliveryDays);
    if (!Number.isFinite(price) || price < 0) {
      setHireError('Enter a valid price.');
      return;
    }
    if (!Number.isInteger(deliveryDays) || deliveryDays < 1) {
      setHireError('Enter a valid number of delivery days.');
      return;
    }

    setHiring(true);
    try {
      const connection = await directContractsApi.create(token, {
        providerProfileId: id,
        categoryId: hireCategoryId,
        title: hireTitle.trim(),
        description: hireDescription.trim(),
        price,
        deliveryDays,
      });
      setHireModalOpen(false);
      navigate(`/contracts/${connection.id}`);
    } catch (err) {
      setHireError(err instanceof ApiError ? err.message : 'Unable to create the contract.');
    } finally {
      setHiring(false);
    }
  };

  if (authLoading) {
    return (
      <Card className="p-10 text-center" data-testid="public-profile-loading">
        <p className="text-ink-muted">Loading…</p>
      </Card>
    );
  }

  if (!accessToken) {
    return (
      <Card className="p-10 text-center space-y-2" data-testid="public-profile-signed-out">
        <p className="text-ink font-medium">Sign in to view this profile.</p>
      </Card>
    );
  }

  if (profile.loading) {
    return (
      <div className="space-y-6" data-testid="public-profile-loading">
        <Card className="p-8 space-y-4">
          <div className="flex items-start gap-4">
            <Skeleton className="w-20 h-20 rounded-2xl shrink-0" />
            <div className="space-y-2 flex-1 pt-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </Card>
        <Card className="p-8 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </Card>
      </div>
    );
  }

  if (profile.error || !profile.data) {
    return (
      <Card className="p-10 text-center space-y-3" data-testid="public-profile-error">
        <p className="text-danger">{profile.error ?? 'Profile not found.'}</p>
        <Button onClick={() => void profile.refetch()} data-testid="public-profile-retry">
          Try again
        </Button>
      </Card>
    );
  }

  const p = profile.data;
  const skills = p.skills ?? [];
  const portfolio = p.portfolioItems ?? [];
  const experiences = p.experiences ?? [];
  const educations = p.educations ?? [];
  const certifications = p.certifications ?? [];
  const languages = p.languages ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="public-profile-page">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
          data-testid="public-profile-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-2">
          {canHireDirectly && (
            <Button
              variant="primary"
              size="sm"
              icon={Handshake}
              onClick={() => setHireModalOpen(true)}
              data-testid="hire-directly"
            >
              Hire directly
            </Button>
          )}
          {canSave && (
            <Button
              variant={isSaved.data?.saved ? 'outline' : 'primary'}
              size="sm"
              icon={Heart}
              onClick={handleToggleSave}
              disabled={savePending || isSaved.loading}
              data-testid="toggle-save-provider"
            >
              {isSaved.data?.saved ? 'Saved' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      <Modal
        isOpen={hireModalOpen}
        onClose={() => setHireModalOpen(false)}
        title={`Hire ${p.displayName} directly`}
        description="Skips the public job posting — this creates a booking with just this provider, at the terms you set."
        maxWidth="lg"
      >
        <div className="space-y-4 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Select value={hireCategoryId} onValueChange={setHireCategoryId}>
                <SelectTrigger data-testid="direct-hire-category" aria-label="Category">
                  <SelectValue placeholder="Choose a category…" />
                </SelectTrigger>
                <SelectContent>
                  {leafCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.parentName} › {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Title"
              value={hireTitle}
              onChange={(e) => setHireTitle(e.target.value)}
              data-testid="direct-hire-title"
              aria-label="Title"
              className="sm:col-span-2"
            />
          </div>
          <Textarea
            rows={4}
            value={hireDescription}
            onChange={(e) => setHireDescription(e.target.value)}
            placeholder="What's this booking for?"
            data-testid="direct-hire-description"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="number"
              placeholder="Agreed price (₹)"
              value={hirePrice}
              onChange={(e) => setHirePrice(e.target.value)}
              data-testid="direct-hire-price"
              aria-label="Agreed price"
            />
            <Input
              type="number"
              placeholder="Delivery days"
              value={hireDeliveryDays}
              onChange={(e) => setHireDeliveryDays(e.target.value)}
              data-testid="direct-hire-delivery"
              aria-label="Delivery days"
            />
          </div>
          {hireError && (
            <p className="text-xs font-semibold text-destructive" data-testid="direct-hire-error">
              {hireError}
            </p>
          )}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleCreateDirectContract}
              disabled={hiring}
              data-testid="confirm-direct-hire"
            >
              {hiring ? 'Creating…' : 'Create contract'}
            </Button>
            <button
              type="button"
              onClick={() => setHireModalOpen(false)}
              className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Card className="p-8 space-y-4">
        <div className="flex items-start gap-4">
          {p.avatar ? (
            <img
              src={p.avatar}
              alt={p.displayName}
              data-testid="public-avatar"
              className="w-20 h-20 rounded-2xl object-cover ring-2 ring-border"
            />
          ) : (
            // A neutral placeholder, not a stock photo of a stranger.
            <div
              data-testid="public-avatar-placeholder"
              className="w-20 h-20 rounded-2xl bg-surface-subtle border border-border flex items-center justify-center text-xl font-semibold text-ink-muted"
            >
              {p.displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-ink" data-testid="public-display-name">
                {p.displayName}
              </h1>
              {p.verified && (
                <span
                  data-testid="public-verified"
                  className="inline-flex items-center gap-1 text-xs text-success"
                >
                  <BadgeCheck className="w-4 h-4" /> Verified
                </span>
              )}
            </div>

            {p.headline && (
              <p className="text-sm text-ink-muted" data-testid="public-headline">
                {p.headline}
              </p>
            )}

            <p className="text-xs text-ink-muted flex items-center gap-3 flex-wrap">
              {p.location && (
                <span className="flex items-center gap-1" data-testid="public-location">
                  <MapPin className="w-3.5 h-3.5" />
                  {p.location}
                </span>
              )}
              <span data-testid="public-availability">{p.availabilityStatus}</span>
              {p.username && <span data-testid="public-username">/u/{p.username}</span>}
            </p>
          </div>
        </div>

        {p.bio && (
          <p className="text-sm text-ink whitespace-pre-line" data-testid="public-bio">
            {p.bio}
          </p>
        )}

        {/* Completed-project counts still have no backend (Contracts hasn't
            shipped). Ratings do now (module5-reviews.md) — a review not yet
            revealed (see the API) is simply absent from these numbers,
            which is correct: it isn't public trust yet either. */}
        {reviewStats.data && reviewStats.data.reviewCount > 0 ? (
          <p
            className="text-xs text-ink flex items-center gap-1.5 font-semibold"
            data-testid="public-rating"
          >
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            {reviewStats.data.averageRating?.toFixed(1)}
            <span className="text-ink-muted font-normal">
              ({reviewStats.data.reviewCount} review{reviewStats.data.reviewCount === 1 ? '' : 's'})
            </span>
          </p>
        ) : (
          <p className="text-xs text-ink-muted" data-testid="public-stats-unavailable">
            No reviews yet.
          </p>
        )}
      </Card>

      {reviews.data && reviews.data.items.length > 0 && (
        <Card className="p-8 space-y-4" data-testid="public-reviews">
          <h2 className="text-lg font-semibold text-ink">Reviews</h2>
          <div className="divide-y divide-border">
            {reviews.data.items.map((review) => (
              <div key={review.id} className="py-3 space-y-1.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-3.5 h-3.5 ${idx < review.rating ? 'fill-amber-500 text-amber-500' : 'text-ink-muted'}`}
                    />
                  ))}
                </div>
                <p className="text-sm text-ink leading-relaxed">{review.comment}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {skills.length > 0 && (
        <Card className="p-8 space-y-3" data-testid="public-skills">
          <h2 className="text-lg font-semibold text-ink">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-surface-subtle border border-border px-3 py-1 text-sm"
              >
                {s.skill.name}
              </span>
            ))}
          </div>
        </Card>
      )}

      {portfolio.length > 0 && (
        <Card className="p-8 space-y-4" data-testid="public-portfolio">
          <h2 className="text-lg font-semibold text-ink">Portfolio</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {portfolio.map((item) => {
              // The first image that actually has a signed URL. One can be
              // null when its file was deleted, and skipping those beats
              // rendering a broken tile.
              const cover = item.images?.find((image) => image.url)?.url;

              return (
                <div
                  key={item.id}
                  data-testid="public-portfolio-item"
                  className="rounded-lg border border-border overflow-hidden"
                >
                  {cover && (
                    <img
                      src={cover}
                      alt={item.title}
                      className="w-full h-40 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <div className="p-4 space-y-1">
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="text-xs text-ink-muted">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {experiences.length > 0 && (
        <Card className="p-8 space-y-3" data-testid="public-experience">
          <h2 className="text-lg font-semibold text-ink">Experience</h2>
          {experiences.map((exp) => (
            <div key={exp.id} className="border-b border-border pb-3 last:border-0">
              <p className="text-sm font-medium text-ink">
                {exp.position} — {exp.company}
              </p>
              <p className="text-xs text-ink-muted">
                {new Date(exp.startDate).getFullYear()} –{' '}
                {exp.currentlyWorking
                  ? 'Present'
                  : exp.endDate
                    ? new Date(exp.endDate).getFullYear()
                    : '—'}
              </p>
              {exp.description && <p className="text-xs text-ink-muted mt-1">{exp.description}</p>}
            </div>
          ))}
        </Card>
      )}

      {educations.length > 0 && (
        <Card className="p-8 space-y-2" data-testid="public-education">
          <h2 className="text-lg font-semibold text-ink">Education</h2>
          {educations.map((edu) => (
            <p key={edu.id} className="text-sm text-ink">
              {edu.degree} — {edu.institution}
            </p>
          ))}
        </Card>
      )}

      {certifications.length > 0 && (
        <Card className="p-8 space-y-2" data-testid="public-certifications">
          <h2 className="text-lg font-semibold text-ink">Certifications</h2>
          {certifications.map((cert) => (
            <p key={cert.id} className="text-sm text-ink">
              {cert.name} — {cert.issuingOrganization}
            </p>
          ))}
        </Card>
      )}

      {languages.length > 0 && (
        <Card className="p-8 space-y-2" data-testid="public-languages">
          <h2 className="text-lg font-semibold text-ink">Languages</h2>
          {languages.map((lang) => (
            <p key={lang.id} className="text-sm text-ink">
              {lang.language} — {lang.proficiency.toLowerCase()}
            </p>
          ))}
        </Card>
      )}

      {/* An empty profile is a real state — a provider who has signed up and
          not filled anything in — so it is rendered honestly rather than
          padded out with placeholder sections. */}
      {skills.length === 0 &&
        portfolio.length === 0 &&
        experiences.length === 0 &&
        educations.length === 0 &&
        certifications.length === 0 &&
        languages.length === 0 && (
          <Card className="p-10 text-center" data-testid="public-profile-empty">
            <p className="text-ink font-medium">This provider hasn&apos;t added details yet.</p>
          </Card>
        )}
    </div>
  );
};
