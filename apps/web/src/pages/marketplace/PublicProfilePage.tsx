import React from 'react';
import { ArrowLeft, BadgeCheck, MapPin } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { profilesApi, type ApiProfile } from '../../lib/marketplace-api';

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
  const { accessToken, goBack, authLoading } = useApp();

  // /profiles/:id requires a session; /u/:username is public. The id route
  // is the authenticated one, so the request waits for auth to settle
  // rather than firing a guaranteed 401 on first paint.
  const profile = useApiResource<PublicProfile>(
    () => profilesApi.byId(accessToken as string, id) as Promise<PublicProfile>,
    [accessToken, id],
    { enabled: !!accessToken },
  );

  if (authLoading) {
    return (
      <Card className="p-10 text-center" data-testid="public-profile-loading">
        <p className="text-muted">Loading…</p>
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
      <Card className="p-10 text-center" data-testid="public-profile-loading">
        <p className="text-muted">Loading profile…</p>
      </Card>
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
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-2 text-sm text-muted hover:text-ink"
        data-testid="public-profile-back"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

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
              className="w-20 h-20 rounded-2xl bg-surface-subtle border border-border flex items-center justify-center text-xl font-semibold text-muted"
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
              <p className="text-sm text-muted" data-testid="public-headline">
                {p.headline}
              </p>
            )}

            <p className="text-xs text-muted flex items-center gap-3 flex-wrap">
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

        {/* Statistics are hardcoded zeros server-side until Jobs and Reviews
            exist (recorded in module2.md). Showing "0 completed projects"
            would read as a real signal about this provider rather than a
            missing feature, so the section says what it actually is. */}
        <p className="text-xs text-muted" data-testid="public-stats-unavailable">
          Ratings and completed-project counts aren&apos;t available yet.
        </p>
      </Card>

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
            {portfolio.map((item) => (
              <div
                key={item.id}
                data-testid="public-portfolio-item"
                className="rounded-lg border border-border overflow-hidden"
              >
                {item.images?.[0] && (
                  <img
                    src={item.images[0].url}
                    alt={item.title}
                    className="w-full h-40 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="p-4 space-y-1">
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="text-xs text-muted">{item.description}</p>
                </div>
              </div>
            ))}
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
              <p className="text-xs text-muted">
                {new Date(exp.startDate).getFullYear()} –{' '}
                {exp.currentlyWorking
                  ? 'Present'
                  : exp.endDate
                    ? new Date(exp.endDate).getFullYear()
                    : '—'}
              </p>
              {exp.description && <p className="text-xs text-muted mt-1">{exp.description}</p>}
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
