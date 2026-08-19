import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Card, Input, TextField, Textarea } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { ImageUploader } from '../media/ImageUploader';
import type { UploadedImage } from '../../lib/media-api';
import { ApiError } from '../../lib/api';
import {
  profilesApi,
  type ApiProfile,
  type AvailabilityStatus,
  type Visibility,
} from '../../lib/marketplace-api';
import { SkillsCard, ExperienceCard, EducationCard, LanguagesCard } from './ProfileCards';

// The real Profiles module (docs/modules/module2.md), as opposed to the
// mock profile fields this app shipped with. Rendered only when there is a
// live session — without a token every one of these calls is a 401, so the
// demo experience is left untouched for signed-out visitors.
//
// data-testid attributes are here for the Playwright suite: the visible
// text is copy that will change, the test ids are a contract.
//
// Skills/Experience/Education/Languages cards moved to ProfileCards.tsx —
// Provider Onboarding renders the same ones now, so one definition serves
// both instead of two parallel forms drifting apart.

const AVAILABILITY: AvailabilityStatus[] = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'];

function Feedback({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return (
      <p data-testid="profile-error" role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p data-testid="profile-success" role="status" className="text-sm text-success">
        {success}
      </p>
    );
  }
  return null;
}

export const ProfileApiSection: React.FC = () => {
  const { accessToken, currentUser } = useApp();
  const token = accessToken;
  const isProvider = currentUser.role === 'vendor';

  const profile = useApiResource<ApiProfile>(() => profilesApi.me(token as string), [token], {
    enabled: !!token,
  });

  const skills = useApiResource(() => profilesApi.listSkills(token), [token], { enabled: !!token });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await action();
      // Awaited before reporting success: showing "Saved" while the screen
      // still displays the previous value is a lie the user can see.
      await profile.refetch();
      setSuccess(message);
    } catch (err) {
      // The API's validation messages are specific and user-facing
      // ("Headline must be shorter than..."), so they are surfaced rather
      // than replaced with a generic failure string.
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!token) return null;

  if (profile.loading) {
    return (
      <Card className="p-8" data-testid="profile-loading">
        <p className="text-ink-muted">Loading your profile…</p>
      </Card>
    );
  }

  if (profile.error) {
    return (
      <Card className="p-8 space-y-4" data-testid="profile-load-error">
        <p className="text-danger">{profile.error}</p>
        <Button onClick={() => void profile.refetch()} data-testid="profile-retry">
          Try again
        </Button>
      </Card>
    );
  }

  const p = profile.data;
  if (!p) return null;

  const usedSkillIds = new Set((p.skills ?? []).map((s) => s.skill.id));
  const availableSkills = (skills.data?.items ?? []).filter((s) => !usedSkillIds.has(s.id));

  return (
    <div className="space-y-6" data-testid="profile-api-section">
      <CoreProfileForm
        key={p.id}
        profile={p}
        token={token}
        saving={saving}
        error={error}
        success={success}
        onSave={(fields) =>
          run(() => profilesApi.updateMe(token, fields as never), 'Profile saved.')
        }
      />

      {isProvider && (
        <>
          <Card className="p-8 space-y-4" data-testid="availability-card">
            <h2 className="text-lg font-semibold text-ink">Availability</h2>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY.map((status) => (
                <Button
                  key={status}
                  variant={p.availabilityStatus === status ? 'primary' : 'secondary'}
                  data-testid={`availability-${status}`}
                  disabled={saving}
                  onClick={() =>
                    run(
                      () => profilesApi.updateAvailability(token, { availabilityStatus: status }),
                      'Availability updated.',
                    )
                  }
                >
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
            <p className="text-sm text-ink-muted" data-testid="availability-current">
              Currently: {p.availabilityStatus}
            </p>
          </Card>

          <SkillsCard
            profile={p}
            availableSkills={availableSkills}
            disabled={saving}
            onAdd={(skillId) => run(() => profilesApi.addSkill(token, skillId), 'Skill added.')}
            onAddNamed={(name) =>
              run(() => profilesApi.addSkillByName(token, name), 'Skill added.')
            }
            onRemove={(userSkillId) =>
              run(() => profilesApi.removeSkill(token, userSkillId), 'Skill removed.')
            }
          />

          <ExperienceCard
            profile={p}
            disabled={saving}
            onAdd={(body) => run(() => profilesApi.addExperience(token, body), 'Experience added.')}
            onRemove={(id) =>
              run(() => profilesApi.removeExperience(token, id), 'Experience removed.')
            }
          />

          <EducationCard
            profile={p}
            disabled={saving}
            onAdd={(body) => run(() => profilesApi.addEducation(token, body), 'Education added.')}
            onRemove={(id) =>
              run(() => profilesApi.removeEducation(token, id), 'Education removed.')
            }
          />

          <LanguagesCard
            profile={p}
            disabled={saving}
            onAdd={(body) => run(() => profilesApi.addLanguage(token, body), 'Language added.')}
            onRemove={(id) => run(() => profilesApi.removeLanguage(token, id), 'Language removed.')}
          />

          <PortfolioCard
            profile={p}
            token={token}
            disabled={saving}
            onAdd={(body) =>
              run(() => profilesApi.addPortfolio(token, body), 'Portfolio piece added.')
            }
            onRemove={(id) =>
              run(() => profilesApi.removePortfolio(token, id), 'Portfolio piece removed.')
            }
          />
        </>
      )}
    </div>
  );
};

// Its own component, mounted with key={profile.id}. That is what lets the
// fields seed from useState initialisers instead of being synchronised in
// an effect: when the profile identity changes React remounts this and the
// initialisers run again. A refetch of the same profile does not remount
// it, so a save never discards what the user has typed.
function CoreProfileForm({
  profile,
  token,
  saving,
  error,
  success,
  onSave,
}: {
  profile: ApiProfile;
  token: string;
  saving: boolean;
  error: string | null;
  success: string | null;
  onSave: (fields: Record<string, string | null>) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  // Seeded from the saved media id, with the signed URL the server returned
  // as its preview. The URL is display only — a save sends the id.
  const [avatar, setAvatar] = useState<UploadedImage[]>(
    profile.avatarMediaId
      ? [
          {
            mediaId: profile.avatarMediaId,
            fileName: 'Profile picture',
            url: profile.avatar ?? undefined,
          },
        ]
      : [],
  );
  const [visibility, setVisibility] = useState<Visibility>(profile.visibility ?? 'PUBLIC');

  return (
    <Card className="p-8 space-y-5">
      <h2 className="text-lg font-semibold text-ink">Profile</h2>

      <TextField
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        data-testid="input-displayName"
      />

      {/* Username is what makes the public profile page reachable at all —
          /u/:username 404s for everyone until one is set. */}
      <TextField
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="e.g. priya-menon"
        hint={
          username
            ? `Your public page: /u/${username}`
            : 'Lowercase letters, numbers and hyphens. Sets your public profile link.'
        }
        data-testid="input-username"
      />

      {/* A profile has one picture, so the uploader is capped at one and
          changing it means removing the current one first. Saving with none
          clears it, which is a real state rather than an error. */}
      <ImageUploader
        token={token}
        images={avatar}
        max={1}
        disabled={saving}
        onChange={setAvatar}
        label="Profile picture"
      />

      <TextField
        label="Headline"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        data-testid="input-headline"
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-bio" className="text-sm font-medium text-ink">
          Bio
        </label>
        <Textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          data-testid="input-bio"
        />
      </div>
      <TextField
        label="Location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        data-testid="input-location"
      />

      {/* Visibility is a business rule in module2.md — the owner controls
          it — and a PRIVATE profile is excluded from marketplace discovery
          entirely. Until now there was no way to exercise that, so the rule
          existed only in the backend. The consequence is spelled out
          because "private" alone does not tell a provider their listings
          will stop appearing in search. */}
      <div
        className="flex flex-col gap-2 rounded-lg border border-border p-4"
        data-testid="visibility-card"
      >
        <span className="text-sm font-medium text-ink">Profile visibility</span>
        <div className="flex gap-2">
          <Button
            variant={visibility === 'PUBLIC' ? 'primary' : 'secondary'}
            data-testid="visibility-PUBLIC"
            onClick={() => setVisibility('PUBLIC')}
          >
            Public
          </Button>
          <Button
            variant={visibility === 'PRIVATE' ? 'primary' : 'secondary'}
            data-testid="visibility-PRIVATE"
            onClick={() => setVisibility('PRIVATE')}
          >
            Private
          </Button>
        </div>
        <p className="text-xs text-ink-muted" data-testid="visibility-explainer">
          {visibility === 'PUBLIC'
            ? 'Clients can find you in the marketplace and view your profile.'
            : 'Your profile is hidden and your services will not appear in marketplace search.'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          disabled={saving}
          data-testid="save-profile"
          onClick={() =>
            onSave({
              displayName: displayName.trim(),
              // Empty strings are sent as null so clearing a field actually
              // clears it rather than storing "". Sending "" for username
              // would fail its format validation instead of clearing it.
              headline: headline.trim() || null,
              bio: bio.trim() || null,
              location: location.trim() || null,
              username: username.trim() || null,
              // The id, never the signed URL. No picture is sent as null,
              // which is what clears it.
              avatarMediaId: avatar[0]?.mediaId ?? null,
              visibility,
            })
          }
        >
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
        <Feedback error={error} success={success} />
      </div>
    </Card>
  );
}

// Portfolio is the surface a client actually judges a provider on, and it
// had no UI at all — the table, the endpoints and the validation all
// existed and were unreachable.
//
// Images are a list rather than one field because the API requires at
// least one and accepts many (ArrayMinSize(1) in portfolio.dto.ts). They
// are real uploads, and what is submitted is the media ids — the pasted-URL
// fields they replaced were only ever a stand-in for the upload pipeline.
const MAX_PORTFOLIO_IMAGES = 10;

function PortfolioCard({
  profile,
  token,
  disabled,
  onAdd,
  onRemove,
}: {
  profile: ApiProfile;
  token: string;
  disabled: boolean;
  onAdd: (body: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [projectDate, setProjectDate] = useState('');
  const [images, setImages] = useState<UploadedImage[]>([]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setProjectDate('');
    setImages([]);
  };

  return (
    <Card className="p-8 space-y-4" data-testid="portfolio-card">
      <h2 className="text-lg font-semibold text-ink">Portfolio</h2>

      <div className="space-y-2" data-testid="portfolio-list">
        {(profile.portfolioItems ?? []).length === 0 && (
          <p className="text-sm text-ink-muted" data-testid="portfolio-empty">
            No portfolio pieces yet. Add your best work so clients can see it.
          </p>
        )}
        {(profile.portfolioItems ?? []).map((item) => (
          <div
            key={item.id}
            data-testid="portfolio-item"
            data-portfolio-title={item.title}
            className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <p className="text-xs text-ink-muted truncate">{item.description}</p>
              <p className="text-xs text-ink-muted">
                {(item.images ?? []).length} image
                {(item.images ?? []).length === 1 ? '' : 's'}
                {item.projectDate ? ` · ${new Date(item.projectDate).getFullYear()}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${item.title}`}
              data-testid={`remove-portfolio-${item.id}`}
              disabled={disabled}
              onClick={() => onRemove(item.id)}
              className="text-ink-muted hover:text-danger shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="portfolio-title"
          aria-label="Portfolio title"
        />
        <Input
          placeholder="Category (optional)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="portfolio-category"
          aria-label="Portfolio category"
        />
      </div>

      <Textarea
        placeholder="What was this project?"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        data-testid="portfolio-description"
        aria-label="Portfolio description"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="portfolio-date" className="text-xs text-ink-muted">
          Project date (optional)
        </label>
        <Input
          id="portfolio-date"
          type="date"
          value={projectDate}
          onChange={(e) => setProjectDate(e.target.value)}
          data-testid="portfolio-date"
        />
      </div>

      <ImageUploader
        token={token}
        images={images}
        max={MAX_PORTFOLIO_IMAGES}
        disabled={disabled}
        onChange={setImages}
        label="Images"
      />

      <Button
        disabled={disabled || !title.trim() || !description.trim() || images.length === 0}
        data-testid="add-portfolio"
        onClick={() => {
          onAdd({
            title: title.trim(),
            description: description.trim(),
            category: category.trim() || undefined,
            projectDate: projectDate ? new Date(projectDate).toISOString() : undefined,
            mediaIds: images.map((image) => image.mediaId),
          });
          reset();
        }}
      >
        Add portfolio piece
      </Button>
    </Card>
  );
}
