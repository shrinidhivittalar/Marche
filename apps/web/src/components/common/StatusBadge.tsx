import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "@marche/ui";
import type { BookingState, EscrowStatus } from "../../types";

type StatusBadgeVariant = NonNullable<BadgeProps["variant"]>;

interface StatusBadgeProps {
  status: BookingState | EscrowStatus | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let variant: StatusBadgeVariant;
  let label: ReactNode = status;

  switch (status) {
    case "Escrow Held":
    case "HELD":
      variant = "info";
      label = status === "HELD" ? "Escrow Held" : status;
      break;
    case "Confirmed":
    case "accepted":
      variant = "success";
      label = status === "accepted" ? "Hired" : status;
      break;
    case "Completed":
      variant = "success";
      break;
    case "Escrow Released":
    case "RELEASED":
    case "Closed":
      variant = "success";
      label = status === "RELEASED" ? "Escrow Released" : status;
      break;
    case "Pending Payment":
    case "Draft":
      variant = "warning";
      break;
    case "Cancelled":
    case "Rejected":
    case "declined":
      variant = "destructive";
      break;
    default:
      variant = "neutral";
  }

  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}
