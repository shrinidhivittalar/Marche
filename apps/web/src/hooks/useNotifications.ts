import { useApp } from '../context/AppContext';

// Thin accessor over AppContext's shared Module 6 state (see the comment
// above apiNotificationsList there) — kept as its own hook so consumers
// (Sidebar, NotificationsPage) don't each spell out the renamed fields.
export function useNotifications() {
  const {
    apiNotifications,
    apiNotificationsLoading,
    apiNotificationsError,
    apiUnreadCount,
    markApiNotificationRead,
    markAllApiNotificationsRead,
  } = useApp();

  return {
    notifications: apiNotifications,
    loading: apiNotificationsLoading,
    error: apiNotificationsError,
    unreadCount: apiUnreadCount,
    markAsRead: markApiNotificationRead,
    markAllRead: markAllApiNotificationsRead,
  };
}
