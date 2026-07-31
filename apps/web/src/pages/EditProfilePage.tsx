import React, { useState } from 'react';
import { MapPin, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, DatePicker, Input, PhoneInput, Textarea } from '@marche/ui';

interface EducationEntry {
  school: string;
  degree?: string;
}

interface ProfileDraftFields {
  companyOrTitle: string;
  hourlyRate: number;
  location: string;
  bio: string;
  education: EducationEntry[];
  phone: string;
  dateOfBirth: string;
}

function draftKey(userId: string): string {
  return `marche_profile_draft_${userId}`;
}

function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadDraft(userId: string): ProfileDraftFields | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as ProfileDraftFields) : null;
  } catch {
    return null;
  }
}

export const EditProfilePage: React.FC = () => {
  const { currentUser, updateCurrentUser, navigate } = useApp();
  const isVendor = currentUser.role === 'vendor';

  const liveFields: ProfileDraftFields = {
    companyOrTitle: currentUser.companyOrTitle || '',
    hourlyRate: currentUser.hourlyRate ?? 0,
    location: currentUser.location || '',
    bio: currentUser.bio || '',
    education: currentUser.education ?? [],
    phone: currentUser.phone || '',
    dateOfBirth: currentUser.dateOfBirth || '',
  };

  const [existingDraft] = useState<ProfileDraftFields | null>(() => loadDraft(currentUser.id));
  const [showDraftBanner, setShowDraftBanner] = useState(
    !!existingDraft && JSON.stringify(existingDraft) !== JSON.stringify(liveFields)
  );

  const initialFields = existingDraft ?? liveFields;

  const [companyOrTitle, setCompanyOrTitle] = useState(initialFields.companyOrTitle);
  const [hourlyRate, setHourlyRate] = useState(initialFields.hourlyRate);
  const [location, setLocation] = useState(initialFields.location);
  const [bio, setBio] = useState(initialFields.bio);
  const [education, setEducation] = useState<EducationEntry[]>(initialFields.education);
  const [eduSchool, setEduSchool] = useState('');
  const [eduDegree, setEduDegree] = useState('');
  const [phone, setPhone] = useState(initialFields.phone);
  const [dateOfBirth, setDateOfBirth] = useState(initialFields.dateOfBirth);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const addEducation = () => {
    if (!eduSchool.trim()) return;
    setEducation([...education, { school: eduSchool.trim(), degree: eduDegree.trim() || undefined }]);
    setEduSchool('');
    setEduDegree('');
  };

  const removeEducation = (idx: number) => {
    setEducation(education.filter((_, i) => i !== idx));
  };

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCurrentUser(
      isVendor
        ? { companyOrTitle, hourlyRate, location, bio, education, phone, dateOfBirth }
        : { companyOrTitle, location, bio }
    );
    localStorage.removeItem(draftKey(currentUser.id));
    setShowDraftBanner(false);
    showStatus('Saved!');
  };

  const handleSaveDraft = () => {
    const draft: ProfileDraftFields = { companyOrTitle, hourlyRate, location, bio, education, phone, dateOfBirth };
    localStorage.setItem(draftKey(currentUser.id), JSON.stringify(draft));
    showStatus('Draft saved on this device.');
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(draftKey(currentUser.id));
    setCompanyOrTitle(liveFields.companyOrTitle);
    setHourlyRate(liveFields.hourlyRate);
    setLocation(liveFields.location);
    setBio(liveFields.bio);
    setEducation(liveFields.education);
    setPhone(liveFields.phone);
    setDateOfBirth(liveFields.dateOfBirth);
    setShowDraftBanner(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Profile Header */}
      <Card className="p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-20 h-20 rounded-2xl object-cover ring-2 ring-border"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-ink">{currentUser.name}</h1>
                {currentUser.verified ? (
                  <Badge variant="success" dot>Verified</Badge>
                ) : (
                  <Badge variant="neutral">Unverified</Badge>
                )}
              </div>
              <p className="text-xs text-ink-muted">
                {companyOrTitle || (isVendor ? 'Add a professional headline' : 'Add a company or title')}
              </p>
              <p className="text-xs text-ink-muted flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                {location || 'Add your location'}
              </p>
            </div>
          </div>

          {isVendor && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/profile/${currentUser.id}`)}>
              See Public View
            </Button>
          )}
        </div>
      </Card>

      {showDraftBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <span>You have unsaved draft changes from a previous session — shown below.</span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="font-semibold hover:underline cursor-pointer"
            >
              Discard draft
            </button>
            <button
              type="button"
              onClick={() => setShowDraftBanner(false)}
              className="text-amber-700 hover:text-amber-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <form onSubmit={handleSave}>
        <Card className="p-8 space-y-6">
          <h2 className="text-lg font-bold text-ink">Edit Profile</h2>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              {isVendor ? 'Professional Headline' : 'Company / Title'}
            </label>
            <Input
              type="text"
              placeholder={isVendor ? 'e.g. Editorial Event Photographer' : 'e.g. Lumina Luxury Events'}
              value={companyOrTitle}
              onChange={(e) => setCompanyOrTitle(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface"
            />
          </div>

          {isVendor && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Hourly Rate (₹)
              </label>
              <Input
                type="number"
                step={5}
                min={0}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Math.max(0, Number(e.target.value)))}
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink font-mono focus:outline-none focus:border-primary focus:bg-surface"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Location
            </label>
            <Input
              type="text"
              placeholder="e.g. Mumbai, Maharashtra"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              About / Summary
            </label>
            <Textarea
              rows={6}
              placeholder={
                isVendor
                  ? 'Describe your experience, specialties, and what makes you stand out...'
                  : 'Describe the kinds of events you host and what you look for in a service provider...'
              }
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl p-4 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface leading-relaxed"
            />
          </div>

          {isVendor && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-2">Education</label>

              {education.length > 0 && (
                <div className="space-y-2 mb-3">
                  {education.map((edu, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 bg-bg border border-border rounded-xl text-xs text-ink"
                    >
                      <span>
                        {edu.school}
                        {edu.degree && <span className="text-ink-muted"> — {edu.degree}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEducation(idx)}
                        className="text-zinc-400 hover:text-rose-600 p-1 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  type="text"
                  placeholder="School / University"
                  value={eduSchool}
                  onChange={(e) => setEduSchool(e.target.value)}
                  className="bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink"
                />
                <Input
                  type="text"
                  placeholder="Degree (optional)"
                  value={eduDegree}
                  onChange={(e) => setEduDegree(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEducation())}
                  className="bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink"
                />
                <Button type="button" variant="outline" size="sm" onClick={addEducation}>
                  Add
                </Button>
              </div>
            </div>
          )}

          {isVendor && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-2">Personal Details</label>
              <p className="text-[11px] text-ink-muted mb-3">We need this to keep payments safe and simple.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Date of birth</label>
                  <DatePicker value={dateOfBirth} onChange={setDateOfBirth} max={todayISODate()} captionLayout="dropdown" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Phone</label>
                  <PhoneInput value={phone} onChange={setPhone} />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            {statusMessage && (
              <span className="text-xs text-primary font-semibold">{statusMessage}</span>
            )}
            <Button type="button" variant="ghost" onClick={handleSaveDraft}>
              Save as Draft
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
