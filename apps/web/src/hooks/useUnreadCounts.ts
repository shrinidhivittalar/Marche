import { useApp } from '../context/AppContext';

// Messaging has no backend yet, so unreadMessages stays mock-derived from
// AppContext. unreadNotifications reads the same shared Module 6 state
// Sidebar and NotificationsPage use — see the comment above
// apiNotificationsList in AppContext.tsx.
export function useUnreadCounts() {
  const { currentUser, contracts, messages, apiUnreadCount } = useApp();

  const myContractIds = new Set(
    contracts
      .filter((c) => c.clientId === currentUser.id || c.vendorId === currentUser.id)
      .map((c) => c.id),
  );
  const unreadMessages = messages.filter(
    (m) => myContractIds.has(m.contractId) && m.senderId !== currentUser.id && !m.read,
  ).length;

  return { unreadNotifications: apiUnreadCount, unreadMessages };
}
