import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, Input, Textarea } from '@marche/ui';

export const EditProfilePage: React.FC = () => {
  const { currentUser, updateCurrentUser, navigate } = useApp();
  const isVendor = currentUser.role === 'vendor';

  const [companyOrTitle, setCompanyOrTitle] = useState(currentUser.companyOrTitle || '');
  const [hourlyRate, setHourlyRate] = useState(currentUser.hourlyRate ?? 0);
  const [location, setLocation] = useState(currentUser.location || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCurrentUser(isVendor ? { companyOrTitle, hourlyRate, location, bio } : { companyOrTitle, location, bio });
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
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
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
            />
          </div>

          {isVendor && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Hourly Rate ($)
              </label>
              <Input
                type="number"
                step={5}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink font-mono focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Location
            </label>
            <Input
              type="text"
              placeholder="e.g. New York, NY"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white"
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
              className="w-full bg-bg border border-border rounded-xl p-4 text-xs text-ink focus:outline-none focus:border-primary focus:bg-white leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            {showSaved && (
              <span className="text-xs text-primary font-semibold">Saved!</span>
            )}
            <Button type="submit">Save Changes</Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
