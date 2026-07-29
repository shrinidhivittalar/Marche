export type UserRole = 'client' | 'vendor' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  companyOrTitle?: string;
  rating?: number;
  reviewCount?: number;
  location?: string;
  bio?: string;
  verified: boolean;
  memberSince: string;
  hourlyRate?: number;
  completedJobsCount?: number;
}

export type EventCategory =
  | 'Website Design'
  | 'Mobile Development'
  | 'Digital Marketing'
  | 'Brand Identity'
  | 'Software Development'
  | 'Photography'
  | 'Catering'
  | 'DJ & Sound'
  | 'Floral & Decor'
  | 'Venue'
  | 'Event Planning'
  | 'Lighting & FX'
  | 'Entertainment'
  | string;

export type TimeSlot = 'Morning' | 'Afternoon' | 'Evening' | 'Full Day';

export type EventTimingMode = 'fixed' | 'flexible';

export type BookingState =
  | 'Draft'
  | 'Open'
  | 'Pending Payment'
  | 'Escrow Held'
  | 'In Progress'
  | 'Confirmed'
  | 'Completed'
  | 'Escrow Released'
  | 'Closed'
  | 'Cancelled'
  | 'Rejected'
  | 'Expired'
  | 'Paused';

export type EscrowStatus = 'none' | 'HELD' | 'RELEASED';

export interface Requirement {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  clientCompany?: string;
  clientVerified: boolean;
  title: string;
  category: EventCategory;
  description: string;
  location: string;
  eventDate: string; // YYYY-MM-DD — exact event date (fixed) or "complete by" date (flexible)
  timingMode: EventTimingMode;
  eventStartTime?: string; // HH:MM, 24h — only when timingMode is 'fixed'
  eventEndTime?: string; // HH:MM, 24h — only when timingMode is 'fixed'
  proposalDeadline: string; // YYYY-MM-DD — cutoff for vendors to submit proposals
  budgetMin: number;
  budgetMax: number;
  status: BookingState;
  proposalsCount: number;
  createdAt: string;
  deliverables: string[];
  featured?: boolean;
  isPaused?: boolean;
}

export interface ProposalMilestone {
  id: string;
  title: string;
  amount: number;
  description: string;
}

export interface Proposal {
  id: string;
  requirementId: string;
  vendorId: string;
  vendorName: string;
  vendorAvatar: string;
  vendorRating: number;
  vendorReviewCount: number;
  vendorCategory: EventCategory;
  vendorLocation: string;
  bidAmount: number;
  coverLetter: string;
  estimatedDelivery: string;
  proposedStartTime?: string; // HH:MM, 24h — only when the requirement's timingMode is 'fixed'
  proposedEndTime?: string; // HH:MM, 24h — only when the requirement's timingMode is 'fixed'
  milestones: ProposalMilestone[];
  status: 'submitted' | 'accepted' | 'declined' | 'withdrawn';
  submittedAt: string;
  portfolioLinks?: string[];
}

export interface Contract {
  id: string;
  requirementId: string;
  requirementTitle: string;
  category: EventCategory;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  vendorId: string;
  vendorName: string;
  vendorAvatar: string;
  proposalId: string;
  amount: number;
  eventDate: string;
  timingMode: EventTimingMode;
  eventStartTime?: string; // HH:MM, 24h — only when timingMode is 'fixed'
  eventEndTime?: string; // HH:MM, 24h — only when timingMode is 'fixed'
  location: string;
  bookingState: BookingState;
  escrowStatus: EscrowStatus;
  createdAt: string;
  vendorCompletedAt?: string;
  clientConfirmedAt?: string;
  escrowReleasedAt?: string;
  acknowledgementNumber: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetEntity: string;
  beforeState?: string;
  afterState?: string;
  reason?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'proposal' | 'escrow' | 'contract' | 'system' | 'job_alert';
  read: boolean;
  timestamp: string;
  linkRoute?: string;
}

export interface VendorService {
  id: string;
  vendorId: string;
  title: string;
  category: EventCategory;
  startingPrice: number;
  description: string;
  includedSlots: TimeSlot[];
  galleryImages: string[];
}

export interface AvailabilitySlot {
  date: string; // YYYY-MM-DD
  slot: TimeSlot;
  status: 'open' | 'blocked' | 'booked';
}

export interface ChatMessage {
  id: string;
  contractId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  read: boolean;
}
