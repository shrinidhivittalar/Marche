import React from 'react';
import {
  Star,
  MapPin,
  ShieldCheck,
  Calendar,
  Clock,
  CheckCircle2,
  DollarSign,
  ArrowLeft,
  Building,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Badge, Button, Card } from '@marche/ui';
import { INITIAL_SERVICES } from '../../data/mockData';

interface VendorProfilePageProps {
  id: string;
}

export const VendorProfilePage: React.FC<VendorProfilePageProps> = ({ id }) => {
  const { currentUser, goBack } = useApp();

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Back Button */}
      <button
        onClick={goBack}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Marketplace</span>
      </button>

      {/* Main Profile Header Card */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            <img
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
              alt="Julian Vance"
              className="w-20 h-20 rounded-2xl object-cover ring-2 ring-border"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-ink">Julian Vance</h1>
                <Badge variant="success" dot>Verified Pro</Badge>
              </div>
              <p className="text-xs text-ink-muted">
                Master Editorial & Event Photographer • Vance Visuals Studio
              </p>
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <span className="flex items-center gap-1 font-semibold text-amber-600">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  4.98 (42 client reviews)
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  New York, NY
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-bg border border-border rounded-2xl text-right shrink-0">
            <span className="block text-[10px] font-mono uppercase text-ink-muted">
              Starting Event Rate
            </span>
            <span className="text-2xl font-extrabold text-primary">
              $350 / hr
            </span>
          </div>
        </div>

        {/* Bio */}
        <div>
          <h3 className="text-xs font-mono uppercase font-bold text-primary mb-2">
            About Studio & Expertise
          </h3>
          <p className="text-xs text-ink leading-relaxed bg-bg p-4 border border-border rounded-xl">
            Award-winning editorial & event photographer specializing in high-profile tech galas, fashion week shows, and private estate gatherings. Equipped with dual Sony A1 cameras, live wireless tethering for real-time social press releases, and master color grading.
          </p>
        </div>

        {/* Portfolio Gallery */}
        <div className="space-y-3 pt-4 border-t border-border">
          <h3 className="text-xs font-mono uppercase font-bold text-primary">
            Featured Event Portfolio
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(INITIAL_SERVICES[0]?.galleryImages ?? []).map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt="Event photography portfolio"
                className="w-full h-44 object-cover rounded-2xl border border-border"
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};
