import React, { useState } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  FileCheck,
  Download,
  Printer,
  Sparkles,
  DollarSign,
  User,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { formatEventSchedule } from '../../lib/formatTime';

interface ContractDetailPageProps {
  id: string;
}

export const ContractDetailPage: React.FC<ContractDetailPageProps> = ({ id }) => {
  const {
    currentUser,
    getContractById,
    vendorMarkCompleted,
    clientConfirmCompletion,
    navigate,
  } = useApp();

  const [acknowledgementOpen, setAcknowledgementOpen] = useState(false);

  const contract = getContractById(id);

  if (!contract) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Contract Not Found"
          description="The requested contract does not exist."
          actionLabel="Back to Dashboard"
          onAction={() =>
            navigate(currentUser.role === 'vendor' ? '/provider/dashboard' : '/client/dashboard')
          }
        />
      </div>
    );
  }

  const isClient = currentUser.id === contract.clientId || currentUser.role === 'client';
  const isVendor = currentUser.id === contract.vendorId || currentUser.role === 'vendor';

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() =>
            navigate(currentUser.role === 'vendor' ? '/provider/dashboard' : '/client/dashboard')
          }
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Workspace</span>
        </button>

        <div className="flex items-center gap-3">
          <StatusBadge status={contract.bookingState} />
          <Button
            size="sm"
            variant="outline"
            icon={FileCheck}
            onClick={() => setAcknowledgementOpen(true)}
          >
            Booking Acknowledgement
          </Button>
        </div>
      </div>

      {/* Contract Header Banner */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-ink-muted font-mono mb-1">
              <span>Contract ID: {contract.id}</span>
              <span>•</span>
              <span className="text-primary font-bold">{contract.category}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {contract.jobTitle}
            </h1>
          </div>

          <div className="p-4 bg-bg border border-border rounded-2xl text-right shrink-0">
            <span className="block text-[10px] font-mono uppercase text-ink-muted">
              Agreed Booking Amount
            </span>
            <span className="text-2xl font-extrabold text-primary">
              ₹{contract.amount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* State Machine Step Progress Bar */}
        <div className="space-y-2">
          <span className="text-xs font-mono uppercase font-bold text-primary">
            Lifecycle State Machine Progress
          </span>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold">
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                contract.bookingState === 'Confirmed' ||
                contract.bookingState === 'Completed' ||
                contract.bookingState === 'Closed'
                  ? 'bg-emerald-50 border-emerald-300 text-primary'
                  : 'bg-bg border-border text-ink-muted'
              }`}
            >
              1. Confirmed
            </div>
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                contract.bookingState === 'Completed' ||
                contract.bookingState === 'Closed'
                  ? 'bg-emerald-50 border-emerald-300 text-primary'
                  : 'bg-bg border-border text-ink-muted'
              }`}
            >
              2. Event Completed
            </div>
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                contract.bookingState === 'Closed'
                  ? 'bg-emerald-50 border-emerald-300 text-primary'
                  : 'bg-bg border-border text-ink-muted'
              }`}
            >
              3. Closed
            </div>
          </div>
        </div>

        {/* Engagement Parties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          <div className="p-4 bg-bg border border-border rounded-2xl flex items-center gap-3">
            <User className="w-8 h-8 text-primary p-1.5 bg-white rounded-full border border-border" />
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">Client</span>
              <span className="text-xs font-bold text-ink">{contract.clientName}</span>
            </div>
          </div>

          <div className="p-4 bg-bg border border-border rounded-2xl flex items-center gap-3">
            <img
              src={contract.vendorAvatar}
              alt={contract.vendorName}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-border"
            />
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">
                Service Provider
              </span>
              <span className="text-xs font-bold text-ink">{contract.vendorName}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Contract Action Controls */}
      <Card className="p-8 space-y-6">
        <h3 className="text-base font-bold text-ink">Engagement Controls & Delivery</h3>

        {/* Current Booking Status Explanation */}
        {contract.bookingState === 'Confirmed' && (
          <div className="p-4 bg-emerald-50/80 border border-emerald-200 text-emerald-900 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span>Booking Confirmed (₹{contract.amount.toLocaleString('en-IN')})</span>
            </div>
            <p className="leading-relaxed">
              This booking is confirmed for the scheduled event date ({contract.eventDate}). The provider will mark it completed once the event is delivered.
            </p>
          </div>
        )}

        {contract.bookingState === 'Completed' && (
          <div className="p-4 bg-amber-50/80 border border-amber-200 text-amber-900 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <Clock className="w-5 h-5 text-amber-700" />
              <span>Event Marked Complete — Awaiting Your Confirmation</span>
            </div>
            <p className="leading-relaxed">
              {contract.vendorName} marked this event as delivered. Confirm below to close out the booking.
            </p>
          </div>
        )}

        {contract.bookingState === 'Closed' && (
          <div className="p-4 bg-emerald-100/60 border border-emerald-300 text-emerald-950 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-primary">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span>Booking Completed & Closed</span>
            </div>
            <p className="leading-relaxed">
              Full payment of ₹{contract.amount.toLocaleString('en-IN')} was confirmed for {contract.vendorName}.
            </p>
          </div>
        )}

        {/* Interactive Lifecycle Trigger Buttons */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-xs text-ink-muted">
              Current Role View:{' '}
              <span className="font-bold text-ink capitalize">{currentUser.role}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Vendor Action */}
            {contract.bookingState === 'Confirmed' && (
              <Button
                icon={CheckCircle2}
                onClick={() => vendorMarkCompleted(contract.id)}
              >
                [Vendor] Mark Event Completed
              </Button>
            )}

            {/* Client Action */}
            {contract.bookingState === 'Completed' && (
              <Button
                icon={CheckCircle2}
                onClick={() => clientConfirmCompletion(contract.id)}
              >
                [Client] Confirm Completion
              </Button>
            )}

            {contract.bookingState === 'Closed' && (
              <span className="px-4 py-2 bg-zinc-100 text-zinc-700 font-semibold rounded-xl text-xs">
                Lifecycle Complete (Terminal Closed State)
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Official Non-Fiscal Booking Acknowledgement Modal */}
      <Modal
        isOpen={acknowledgementOpen}
        onClose={() => setAcknowledgementOpen(false)}
        title="Official Booking Acknowledgement"
        description="PRD Section 8.7 & FR-35: Non-fiscal booking acknowledgement document."
        maxWidth="xl"
      >
        <div className="space-y-6 pt-2 text-xs">
          <div className="p-6 bg-white border border-border rounded-2xl shadow-xs space-y-4">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <span className="text-lg font-black text-ink tracking-tight">MARCHÉ</span>
                <span className="block text-[10px] font-mono text-ink-muted">
                  Booking Reference ID: {contract.acknowledgementNumber}
                </span>
              </div>
              <StatusBadge status={contract.bookingState} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">Client</span>
                <p className="font-bold text-ink">{contract.clientName}</p>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">
                  Service Provider
                </span>
                <p className="font-bold text-ink">{contract.vendorName}</p>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">Event Date & Time</span>
                <p className="font-semibold text-ink">
                  {formatEventSchedule(contract.eventDate, contract.timingMode, contract.eventStartTime, contract.eventEndTime)}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">Category</span>
                <p className="font-bold text-primary">{contract.category}</p>
              </div>
            </div>

            <div className="p-3 bg-bg border border-border rounded-xl flex justify-between font-mono font-bold text-sm">
              <span>Contract Agreed Total:</span>
              <span className="text-primary">₹{contract.amount.toLocaleString('en-IN')}</span>
            </div>

            <p className="text-[10px] text-ink-muted italic leading-relaxed pt-2 border-t border-border">
              Notice: This document is a non-fiscal confirmation of a marketplace service reservation. It does not constitute a tax invoice.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              icon={Printer}
              onClick={() => window.print()}
            >
              Print Document
            </Button>
            <Button size="sm" onClick={() => setAcknowledgementOpen(false)}>
              Close View
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
