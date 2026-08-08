import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Card, Input, TextField, Textarea } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { ApiError } from '../../lib/api';
import {
  profilesApi,
  type ApiProfile,
  type AvailabilityStatus,
  type LanguageProficiency,
} from '../../lib/marketplace-api';

// The real Profiles module (docs/modules/module2.md), as opposed to the
// mock profile fields this app shipped with. Rendered only when there is a
// live session — without a token every one of these calls is a 401, so the
// demo experience is left untouched for signed-out visitors.
//
// data-testid attributes are here for the Playwright suite: the visible
// text is copy that will change, the test ids are a contract.

const AVAILABILITY: AvailabilityStatus[] = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'];
const PROFICIENCY: LanguageProficiency[] = ['BASIC', 'CONVERSATIONAL', 'FLUENT', 'NATIVE'];

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
        <p className="text-muted">Loading your profile…</p>
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
            <p className="text-sm text-muted" data-testid="availability-current">
              Currently: {p.availabilityStatus}
            </p>
          </Card>

          <SkillsCard
            profile={p}
            availableSkills={availableSkills}
            disabled={saving}
            onAdd={(skillId) => run(() => profilesApi.addSkill(token, skillId), 'Skill added.')}
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
  saving,
  error,
  success,
  onSave,
}: {
  profile: ApiProfile;
  saving: boolean;
  error: string | null;
  success: string | null;
  onSave: (fields: Record<string, string | null>) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState(profile.location ?? '');

  return (
    <Card className="p-8 space-y-5">
      <h2 className="text-lg font-semibold text-ink">Profile</h2>

      <TextField
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        data-testid="input-displayName"
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

      <div className="flex items-center gap-3">
        <Button
          disabled={saving}
          data-testid="save-profile"
          onClick={() =>
            onSave({
              displayName: displayName.trim(),
              // Empty strings are sent as null so clearing a field actually
              // clears it rather than storing "".
              headline: headline.trim() || null,
              bio: bio.trim() || null,
              location: location.trim() || null,
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

function SkillsCard({
  profile,
  availableSkills,
  disabled,
  onAdd,
  onRemove,
}: {
  profile: ApiProfile;
  availableSkills: { id: string; name: string }[];
  disabled: boolean;
  onAdd: (skillId: string) => void;
  onRemove: (userSkillId: string) => void;
}) {
  const [selected, setSelected] = useState('');
  return (
    <Card className="p-8 space-y-4" data-testid="skills-card">
      <h2 className="text-lg font-semibold text-ink">Skills</h2>
      <div className="flex flex-wrap gap-2" data-testid="skill-list">
        {(profile.skills ?? []).length === 0 && (
          <p className="text-sm text-muted" data-testid="skills-empty">
            No skills added yet.
          </p>
        )}
        {(profile.skills ?? []).map((entry) => (
          <span
            key={entry.id}
            data-testid={`skill-${entry.skill.name}`}
            className="inline-flex items-center gap-2 rounded-full bg-surface-subtle border border-border px-3 py-1 text-sm"
          >
            {entry.skill.name}
            <button
              type="button"
              aria-label={`Remove ${entry.skill.name}`}
              data-testid={`remove-skill-${entry.skill.name}`}
              disabled={disabled}
              onClick={() => onRemove(entry.id)}
              className="text-muted hover:text-danger"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          data-testid="skill-select"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="">Choose a skill…</option>
          {availableSkills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          disabled={disabled || !selected}
          data-testid="add-skill"
          onClick={() => {
            onAdd(selected);
            setSelected('');
          }}
        >
          Add
        </Button>
      </div>
    </Card>
  );
}

function ExperienceCard({
  profile,
  disabled,
  onAdd,
  onRemove,
}: {
  profile: ApiProfile;
  disabled: boolean;
  onAdd: (body: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [startDate, setStartDate] = useState('');

  return (
    <Card className="p-8 space-y-4" data-testid="experience-card">
      <h2 className="text-lg font-semibold text-ink">Experience</h2>
      <div className="space-y-2" data-testid="experience-list">
        {(profile.experiences ?? []).length === 0 && (
          <p className="text-sm text-muted" data-testid="experience-empty">
            No experience added yet.
          </p>
        )}
        {(profile.experiences ?? []).map((exp) => (
          <div
            key={exp.id}
            data-testid="experience-item"
            className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
          >
            <span className="text-sm text-ink">
              {exp.position} — {exp.company}
            </span>
            <button
              type="button"
              aria-label={`Remove ${exp.position}`}
              data-testid={`remove-experience-${exp.id}`}
              disabled={disabled}
              onClick={() => onRemove(exp.id)}
              className="text-muted hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          data-testid="experience-company"
        />
        <Input
          placeholder="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          data-testid="experience-position"
        />
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          data-testid="experience-start"
        />
      </div>
      <Button
        disabled={disabled || !company.trim() || !position.trim() || !startDate}
        data-testid="add-experience"
        onClick={() => {
          onAdd({
            company: company.trim(),
            position: position.trim(),
            startDate: new Date(startDate).toISOString(),
            currentlyWorking: true,
          });
          setCompany('');
          setPosition('');
          setStartDate('');
        }}
      >
        Add experience
      </Button>
    </Card>
  );
}

function EducationCard({
  profile,
  disabled,
  onAdd,
  onRemove,
}: {
  profile: ApiProfile;
  disabled: boolean;
  onAdd: (body: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [institution, setInstitution] = useState('');
  const [degree, setDegree] = useState('');

  return (
    <Card className="p-8 space-y-4" data-testid="education-card">
      <h2 className="text-lg font-semibold text-ink">Education</h2>
      <div className="space-y-2" data-testid="education-list">
        {(profile.educations ?? []).length === 0 && (
          <p className="text-sm text-muted" data-testid="education-empty">
            No education added yet.
          </p>
        )}
        {(profile.educations ?? []).map((edu) => (
          <div
            key={edu.id}
            data-testid="education-item"
            className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
          >
            <span className="text-sm text-ink">
              {edu.degree} — {edu.institution}
            </span>
            <button
              type="button"
              aria-label={`Remove ${edu.degree}`}
              data-testid={`remove-education-${edu.id}`}
              disabled={disabled}
              onClick={() => onRemove(edu.id)}
              className="text-muted hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Institution"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          data-testid="education-institution"
        />
        <Input
          placeholder="Degree"
          value={degree}
          onChange={(e) => setDegree(e.target.value)}
          data-testid="education-degree"
        />
      </div>
      <Button
        disabled={disabled || !institution.trim() || !degree.trim()}
        data-testid="add-education"
        onClick={() => {
          onAdd({ institution: institution.trim(), degree: degree.trim() });
          setInstitution('');
          setDegree('');
        }}
      >
        Add education
      </Button>
    </Card>
  );
}

function LanguagesCard({
  profile,
  disabled,
  onAdd,
  onRemove,
}: {
  profile: ApiProfile;
  disabled: boolean;
  onAdd: (body: { language: string; proficiency: LanguageProficiency }) => void;
  onRemove: (id: string) => void;
}) {
  const [language, setLanguage] = useState('');
  const [proficiency, setProficiency] = useState<LanguageProficiency>('CONVERSATIONAL');

  return (
    <Card className="p-8 space-y-4" data-testid="languages-card">
      <h2 className="text-lg font-semibold text-ink">Languages</h2>
      <div className="space-y-2" data-testid="language-list">
        {(profile.languages ?? []).length === 0 && (
          <p className="text-sm text-muted" data-testid="languages-empty">
            No languages added yet.
          </p>
        )}
        {(profile.languages ?? []).map((lang) => (
          <div
            key={lang.id}
            data-testid="language-item"
            className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
          >
            <span className="text-sm text-ink">
              {lang.language} — {lang.proficiency}
            </span>
            <button
              type="button"
              aria-label={`Remove ${lang.language}`}
              data-testid={`remove-language-${lang.id}`}
              disabled={disabled}
              onClick={() => onRemove(lang.id)}
              className="text-muted hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          data-testid="language-name"
        />
        <select
          value={proficiency}
          onChange={(e) => setProficiency(e.target.value as LanguageProficiency)}
          data-testid="language-proficiency"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          {PROFICIENCY.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>
      <Button
        disabled={disabled || !language.trim()}
        data-testid="add-language"
        onClick={() => {
          onAdd({ language: language.trim(), proficiency });
          setLanguage('');
        }}
      >
        Add language
      </Button>
    </Card>
  );
}
