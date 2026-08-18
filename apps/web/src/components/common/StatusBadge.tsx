import type { ReactNode } from 'react';
import { Badge, type BadgeProps } from '@marche/ui';
import type { BookingState } from '../../types';

type StatusBadgeVariant = NonNullable<BadgeProps['variant']>;

interface StatusBadgeProps {
  status: BookingState | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let variant: StatusBadgeVariant;
  let label: ReactNode = status;

  switch (status) {
    case 'Confirmed':
    case 'accepted':
    case 'ACTIVE':
      variant = 'success';
      label = status === 'accepted' ? 'Hired' : status === 'ACTIVE' ? 'Active' : status;
      break;
    case 'Completed':
    case 'Closed':
    case 'COMPLETED':
      variant = 'success';
      label = status === 'COMPLETED' ? 'Completed' : status;
      break;
    case 'Draft':
    case 'draft':
      variant = 'warning';
      label = status === 'draft' ? 'Draft' : status;
      break;
    case 'Cancelled':
    case 'Rejected':
    case 'declined':
      variant = 'destructive';
      break;
    default:
      variant = 'neutral';
  }

  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}
