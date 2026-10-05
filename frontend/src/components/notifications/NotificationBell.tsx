import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellRing,
  Calendar,
  CalendarX2,
  Check,
  CheckCheck,
  PartyPopper,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import type { NotificationRecord, NotificationType } from '@/lib/types';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

const ICONS: Record<NotificationType, typeof CalendarX2> = {
  'event.cancelled': CalendarX2,
  'event.updated': Calendar,
  'event.reactivated': PartyPopper,
  'event.deleted': Trash2,
};

const ACCENT: Record<NotificationType, string> = {
  'event.cancelled': 'text-red-500',
  'event.updated': 'text-amber-500',
  'event.reactivated': 'text-emerald-500',
  'event.deleted': 'text-red-500',
};

function timeAgo(dateString: string | null): string {
  if (!dateString) return '';
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* -------------------------------------------------- poll unread count */
  const fetchUnread = useCallback(async () => {
    if (!user) return;
    try {
      const { count } = await api.unreadCount();
      setUnreadCount(count);
    } catch {
      // Swallow – the badge just won't update.
    }
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const timer = setInterval(fetchUnread, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchUnread]);

  /* -------------------------------------------------- open / close */
  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const { notifications: items } = await api.listNotifications();
      setNotifications(items);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
    } else {
      openPanel();
    }
  };

  /* -------------------------------------------------- click-away */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /* -------------------------------------------------- mark read */
  const markOneRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  if (!user) return null;

  return (
    <div ref={panelRef} className="relative">
      {/* ------------------------------------------------ bell button */}
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
          'text-ink-soft hover:bg-surface-sunken hover:text-ink',
        )}
      >
        {unreadCount > 0 ? (
          <BellRing className="h-[1.125rem] w-[1.125rem] animate-[wiggle_0.4s_ease-in-out]" />
        ) : (
          <Bell className="h-[1.125rem] w-[1.125rem]" />
        )}

        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold leading-none text-white shadow-sm"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ------------------------------------------------ dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'absolute right-0 z-50 mt-2 w-[22rem] animate-scale-in overflow-hidden rounded-xl',
            'bg-surface-raised shadow-xl ring-1 ring-border',
          )}
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-ink">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand-soft"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* list */}
          <div className="max-h-[24rem] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <RefreshCw className="h-5 w-5 animate-spin text-ink-muted" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <Bell className="h-8 w-8 text-ink-muted/40" />
                <p className="text-sm text-ink-muted">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = ICONS[notification.type] ?? Bell;
                const accent = ACCENT[notification.type] ?? 'text-ink-muted';

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'group relative flex gap-3 border-b border-border/50 px-4 py-3 transition-colors last:border-0',
                      notification.read ? 'bg-transparent' : 'bg-brand-soft/30',
                    )}
                  >
                    {/* icon */}
                    <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken', accent)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* content */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] font-semibold text-ink">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                        {notification.body}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        {/* A deleted event has no page to open. */}
                        {notification.type !== 'event.deleted' && (
                          <Link
                            to={`/events/${notification.eventId}`}
                            onClick={() => setOpen(false)}
                            className="text-xs font-medium text-brand hover:underline"
                          >
                            View event
                          </Link>
                        )}
                        <span className="text-[0.6875rem] text-ink-muted">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* mark-read button */}
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={() => markOneRead(notification.id)}
                        aria-label="Mark as read"
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted opacity-0 transition-all hover:bg-surface-sunken hover:text-ink group-hover:opacity-100"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
