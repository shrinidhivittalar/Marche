import { useApp } from '../context/AppContext';

export function useUnreadCounts() {
  const { currentUser, notifications, contracts, messages } = useApp();

  const unreadNotifications = notifications.filter(
    (n) => n.userId === currentUser.id && !n.read,
  ).length;

  const myContractIds = new Set(
    contracts
      .filter((c) => c.clientId === currentUser.id || c.vendorId === currentUser.id)
      .map((c) => c.id),
  );
  const unreadMessages = messages.filter(
    (m) => myContractIds.has(m.contractId) && m.senderId !== currentUser.id && !m.read,
  ).length;

  return { unreadNotifications, unreadMessages };
}
