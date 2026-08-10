import React from 'react';
import { PROPOSAL_STATUS_STYLE } from '../../lib/formatProposal';
import type { ProposalStatus } from '../../lib/proposals-api';

// One badge for both sides of a proposal, so a status never reads one way on
// the provider's screen and another on the client's.
export const ProposalStatusBadge: React.FC<{ status: ProposalStatus }> = ({ status }) => {
  const { label, className } = PROPOSAL_STATUS_STYLE[status];
  return (
    <span
      className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
};
