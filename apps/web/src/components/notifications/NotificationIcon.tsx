import { Ban, FileText, ShieldCheck } from 'lucide-react';
import { notificationCategory } from '../../lib/formatNotification';
import type { ApiNotification } from '../../lib/notifications-api';

interface NotificationIconProps {
  type: ApiNotification['type'];
  size?: 'sm' | 'md';
}

// The icon + color-by-category mapping shared by the bell dropdown
// (Sidebar) and the full activity page (NotificationsPage) — the one piece
// of the two notification cards that was actually duplicated logic, not
// just visually similar layout that happens to look alike.
export function NotificationIcon({ type, size = 'md' }: NotificationIconProps) {
  const category = notificationCategory(type);
  const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl';
  const glyph = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div
      className={`${box} flex items-center justify-center shrink-0 ${
        category === 'proposal'
          ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400'
          : category === 'connection'
            ? 'bg-primary/10 text-primary'
            : 'bg-surface-subtle text-ink'
      }`}
    >
      {category === 'proposal' ? (
        <FileText className={glyph} />
      ) : category === 'connection' ? (
        <ShieldCheck className={glyph} />
      ) : (
        <Ban className={glyph} />
      )}
    </div>
  );
}
