// Skills/Experience/Education/Languages editors — shared by Profile
// Settings (ProfileApiSection) and Provider Onboarding, both of which write
// through the same real endpoints. Pulled out here rather than duplicated a
// second time in the wizard: same form, same API, same validation either
// place it's rendered.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  Combobox,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@marche/ui';
import type { ApiProfile, LanguageProficiency } from '../../lib/marketplace-api';

const PROFICIENCY: LanguageProficiency[] = ['BASIC', 'CONVERSATIONAL', 'FLUENT', 'NATIVE'];
const PROFICIENCY_LABEL: Record<LanguageProficiency, string> = {
  BASIC: 'Basic',
  CONVERSATIONAL: 'Conversational',
  FLUENT: 'Fluent',
  NATIVE: 'Native',
};

// A starting list, not an exhaustive one — Combobox lets a client type and
// add anything missing (same escape hatch SkillsCard already relies on for
// crafts the seeded list doesn't cover).
const COMMON_LANGUAGES = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Gujarati',
  'Bengali',
  'Punjabi',
  'Urdu',
  'Odia',
  'Assamese',
  'French',
  'German',
  'Spanish',
  'Mandarin',
  'Arabic',
];

export function SkillsCard({
  profile,
  availableSkills,
  disabled,
  onAdd,
  onAddNamed,
  onRemove,
}: {
  profile: ApiProfile;
  availableSkills: { id: string; name: string }[];
  disabled: boolean;
  onAdd: (skillId: string) => void;
  onAddNamed: (name: string) => void;
  onRemove: (userSkillId: string) => void;
}) {
  const [selected, setSelected] = useState('');
  return (
    <Card className="p-8 space-y-4" data-testid="skills-card">
      <h2 className="text-lg font-semibold text-ink">Skills</h2>
      <div className="flex flex-wrap gap-2" data-testid="skill-list">
        {(profile.skills ?? []).length === 0 && (
          <p className="text-sm text-ink-muted" data-testid="skills-empty">
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
              className="text-ink-muted hover:text-danger"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Combobox
          value={selected}
          onChange={setSelected}
          options={availableSkills.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Choose a skill…"
          searchPlaceholder="Search or type your own…"
          emptyText="No matching skills."
          disabled={disabled}
          data-testid="skill-select"
          className="flex-1 h-auto py-2 text-sm"
          // Typing your own is the point: the seeded list cannot cover every
          // craft. The server matches a typed name against the list
          // case-insensitively before creating anything, so this adds a
          // duplicate only if one genuinely does not exist yet.
          //
          // availableSkills already excludes skills the profile holds, so
          // retyping one of those wouldn't match anything in `options` and
          // would offer to "create" it — a name the server already has,
          // just not attachable twice. existingLabels catches that case too.
          existingLabels={(profile.skills ?? []).map((entry) => entry.skill.name)}
          onCreate={(name) => onAddNamed(name)}
          createLabel={(name) => `Add "${name}" as a new skill`}
        />
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
      <p className="text-xs text-ink-muted">
        Pick from the list where you can — those are what clients filter on. Anything missing, type
        it and press Enter.
      </p>
    </Card>
  );
}

export function ExperienceCard({
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
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Defaults to a finished role, not a current one. The previous version
  // hardcoded currentlyWorking: true, which made it impossible to record
  // any past job — the common case for a work history.
  const [currentlyWorking, setCurrentlyWorking] = useState(false);

  return (
    <Card className="p-8 space-y-4" data-testid="experience-card">
      <h2 className="text-lg font-semibold text-ink">Experience</h2>
      <div className="space-y-2" data-testid="experience-list">
        {(profile.experiences ?? []).length === 0 && (
          <p className="text-sm text-ink-muted" data-testid="experience-empty">
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
              <span className="block text-xs text-ink-muted">
                {new Date(exp.startDate).getFullYear()} –{' '}
                {exp.currentlyWorking
                  ? 'Present'
                  : exp.endDate
                    ? new Date(exp.endDate).getFullYear()
                    : '—'}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${exp.position}`}
              data-testid={`remove-experience-${exp.id}`}
              disabled={disabled}
              onClick={() => onRemove(exp.id)}
              className="text-ink-muted hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          data-testid="experience-company"
          aria-label="Company"
        />
        <Input
          placeholder="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          data-testid="experience-position"
          aria-label="Position"
        />
      </div>

      <Textarea
        placeholder="What did you do in this role? (optional)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        data-testid="experience-description"
        aria-label="Role description"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="experience-start" className="text-xs text-ink-muted">
            Start date
          </label>
          <DatePicker
            value={startDate}
            onChange={setStartDate}
            max={endDate || undefined}
            captionLayout="dropdown"
            data-testid="experience-start"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="experience-end" className="text-xs text-ink-muted">
            End date
          </label>
          <DatePicker
            value={endDate}
            onChange={setEndDate}
            min={startDate || undefined}
            captionLayout="dropdown"
            // Disabled rather than merely validated: the API rejects an end
            // date alongside "currently working", so the contradiction is
            // made unreachable instead of explained after the fact.
            disabled={currentlyWorking}
            data-testid="experience-end"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={currentlyWorking}
          onChange={(e) => {
            setCurrentlyWorking(e.target.checked);
            if (e.target.checked) setEndDate('');
          }}
          data-testid="experience-current"
        />
        I currently work here
      </label>
      <Button
        disabled={disabled || !company.trim() || !position.trim() || !startDate}
        data-testid="add-experience"
        onClick={() => {
          onAdd({
            company: company.trim(),
            position: position.trim(),
            description: description.trim() || undefined,
            startDate: new Date(startDate).toISOString(),
            endDate: !currentlyWorking && endDate ? new Date(endDate).toISOString() : undefined,
            currentlyWorking,
          });
          setCompany('');
          setPosition('');
          setDescription('');
          setStartDate('');
          setEndDate('');
          setCurrentlyWorking(false);
        }}
      >
        Add experience
      </Button>
    </Card>
  );
}

export function EducationCard({
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
          <p className="text-sm text-ink-muted" data-testid="education-empty">
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
              className="text-ink-muted hover:text-danger"
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

export function CertificationCard({
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
  const [name, setName] = useState('');
  const [issuingOrganization, setIssuingOrganization] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  return (
    <Card className="p-8 space-y-4" data-testid="certification-card">
      <h2 className="text-lg font-semibold text-ink">Certifications</h2>
      <div className="space-y-2" data-testid="certification-list">
        {(profile.certifications ?? []).length === 0 && (
          <p className="text-sm text-ink-muted" data-testid="certification-empty">
            No certifications added yet.
          </p>
        )}
        {(profile.certifications ?? []).map((cert) => (
          <div
            key={cert.id}
            data-testid="certification-item"
            className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
          >
            <span className="text-sm text-ink">
              {cert.name} — {cert.issuingOrganization}
              {cert.expiryDate && (
                <span className="block text-xs text-ink-muted">
                  Expires {new Date(cert.expiryDate).getFullYear()}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label={`Remove ${cert.name}`}
              data-testid={`remove-certification-${cert.id}`}
              disabled={disabled}
              onClick={() => onRemove(cert.id)}
              className="text-ink-muted hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Certification name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="certification-name"
          aria-label="Certification name"
        />
        <Input
          placeholder="Issuing organization"
          value={issuingOrganization}
          onChange={(e) => setIssuingOrganization(e.target.value)}
          data-testid="certification-issuer"
          aria-label="Issuing organization"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="certification-issue-date" className="text-xs text-ink-muted">
            Issue date (optional)
          </label>
          <DatePicker
            value={issueDate}
            onChange={setIssueDate}
            max={expiryDate || undefined}
            captionLayout="dropdown"
            data-testid="certification-issue-date"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="certification-expiry-date" className="text-xs text-ink-muted">
            Expiry date (optional)
          </label>
          <DatePicker
            value={expiryDate}
            onChange={setExpiryDate}
            min={issueDate || undefined}
            captionLayout="dropdown"
            data-testid="certification-expiry-date"
          />
        </div>
      </div>
      <Button
        disabled={disabled || !name.trim() || !issuingOrganization.trim()}
        data-testid="add-certification"
        onClick={() => {
          onAdd({
            name: name.trim(),
            issuingOrganization: issuingOrganization.trim(),
            issueDate: issueDate ? new Date(issueDate).toISOString() : undefined,
            expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined,
          });
          setName('');
          setIssuingOrganization('');
          setIssueDate('');
          setExpiryDate('');
        }}
      >
        Add certification
      </Button>
    </Card>
  );
}

export function LanguagesCard({
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
  const existingLanguages = (profile.languages ?? []).map((l) => l.language);

  return (
    <Card className="p-8 space-y-4" data-testid="languages-card">
      <h2 className="text-lg font-semibold text-ink">Languages</h2>
      <div className="space-y-2" data-testid="language-list">
        {(profile.languages ?? []).length === 0 && (
          <p className="text-sm text-ink-muted" data-testid="languages-empty">
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
              className="text-ink-muted hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Combobox
          value={language}
          onChange={setLanguage}
          options={COMMON_LANGUAGES.map((name) => ({ value: name, label: name }))}
          placeholder="Choose a language…"
          searchPlaceholder="Search or type your own…"
          emptyText="No matching languages."
          disabled={disabled}
          data-testid="language-name"
          existingLabels={existingLanguages}
          onCreate={(name) => onAdd({ language: name, proficiency })}
          createLabel={(name) => `Add "${name}"`}
        />
        <Select
          value={proficiency}
          onValueChange={(value) => setProficiency(value as LanguageProficiency)}
        >
          <SelectTrigger data-testid="language-proficiency" aria-label="Proficiency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROFICIENCY.map((level) => (
              <SelectItem key={level} value={level}>
                {PROFICIENCY_LABEL[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
