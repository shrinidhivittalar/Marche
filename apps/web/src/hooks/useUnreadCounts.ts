import { useApp } from '../context/AppContext';

// Both counts read real, server-side state now — apiUnreadCount from the
// Module 6 notifications API, apiMessagesUnreadCount from Module 5's
// messages API (see AppContext.tsx's apiMessagesUnread).
export function useUnreadCounts() {
  const { apiUnreadCount, apiMessagesUnreadCount } = useApp();

  return { unreadNotifications: apiUnreadCount, unreadMessages: apiMessagesUnreadCount };
}
