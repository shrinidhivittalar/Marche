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
  category?: EventCategory;
  skills?: string[];
  workExperience?: {
    title: string;
    company: string;
    location?: string;
    startDate?: string; // YYYY-MM
    endDate?: string; // YYYY-MM
    current?: boolean;
  }[];
  education?: { school: string; degree?: string }[];
  languages?: { language: string; proficiency: EnglishLevel }[];
  phone?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  website?: string;
  orgSize?: string;
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
  | 'In Progress'
  | 'Confirmed'
  | 'Completed'
  | 'Closed'
  | 'Cancelled'
  | 'Rejected'
  | 'Expired'
  | 'Paused';

export interface Job {
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
  isDraftPost?: boolean; // true only for a job saved from the wizard that has never been published
}

export interface ProposalMilestone {
  id: string;
  title: string;
  amount: number;
  description: string;
}

export interface Proposal {
  id: string;
  jobId: string;
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
  proposedStartTime?: string; // HH:MM, 24h — only when the job's timingMode is 'fixed'
  proposedEndTime?: string; // HH:MM, 24h — only when the job's timingMode is 'fixed'
  milestones: ProposalMilestone[];
  status: 'draft' | 'submitted' | 'accepted' | 'declined' | 'withdrawn';
  submittedAt: string;
  portfolioLinks?: string[];
}

export interface Contract {
  id: string;
  jobId: string;
  jobTitle: string;
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
  createdAt: string;
  vendorCompletedAt?: string;
  clientConfirmedAt?: string;
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
  type: 'proposal' | 'contract' | 'system' | 'job_alert';
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

export type EnglishLevel = 'Basic' | 'Conversational' | 'Fluent' | 'Native or bilingual';

export interface TalentProfile {
  id: string;
  name: string;
  avatar: string;
  portfolioImage: string;
  category: EventCategory;
  headline: string;
  bio: string;
  rating: number;
  reviewCount: number;
  location: string;
  timezone: string; // IANA time zone id, e.g. 'America/New_York'
  hourlyRate: number;
  verified: boolean;
  availableNow: boolean;
  jobsCompleted: number;
  skills: string[];
  englishLevel: EnglishLevel;
  hoursBilled: number;
  earned: number;
  hoursPerWeek: string;
  openToContractToHire: boolean;
  avgResponseHours: string;
}

export type WorkHistoryStatus = 'completed' | 'in_progress';
export type PriceType = 'Fixed price' | 'Hourly';

export interface ProviderWorkHistoryEntry {
  id: string;
  vendorId: string;
  jobTitle: string;
  category: EventCategory;
  clientName: string;
  clientAvatar: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD — absent while status is 'in_progress'
  status: WorkHistoryStatus;
  priceType: PriceType;
  amount: number;
  rating?: number; // present when status is 'completed'
  review?: string; // present when status is 'completed'
  tags?: string[]; // insight tags, present when status is 'completed'
}

export interface ProviderPortfolioItem {
  id: string;
  vendorId: string;
  image: string;
  caption: string;
}

export interface ProviderProjectPackage {
  id: string;
  vendorId: string;
  image: string;
  title: string;
  priceFrom: number;
  deliveryDays: number;
}

export interface ProviderTestimonial {
  id: string;
  vendorId: string;
  quote: string;
  authorName: string;
  authorTitle: string;
  company: string;
  date: string; // YYYY-MM-DD
  verified: boolean;
}

export interface ProviderEmploymentEntry {
  id: string;
  vendorId: string;
  title: string;
  company: string;
  startDate: string; // YYYY-MM
  endDate?: string; // YYYY-MM — absent means current
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
