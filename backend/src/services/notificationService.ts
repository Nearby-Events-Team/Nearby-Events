import { FieldValue, getDb, type DocumentData } from '../config/firebase';
import { logger } from '../config/logger';
import { publishEventNotification } from '../config/pubsub';
import { toIso } from '../utils/dates';

/* ------------------------------------------------------------------ types */

export type NotificationType = 'event.cancelled' | 'event.updated' | 'event.reactivated';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  eventId: string;
  eventTitle: string;
  read: boolean;
  createdAt: string | null;
}

interface PubSubMessageData {
  action: NotificationType;
  eventId: string;
  eventTitle: string;
  organizerName: string;
  /** Only for event.updated — what changed. */
  changes?: string[];
}

const NOTIFICATIONS = 'notifications';
const EVENTS = 'events';
const RSVPS = 'rsvps';

/* ------------------------------------------------- publish (called by API) */

/**
 * Fires an event notification to the Pub/Sub topic. The API call returns
 * immediately — the actual fan-out to each attendee happens asynchronously
 * when the push subscriber picks up the message.
 */
export async function publishNotification(
  action: NotificationType,
  eventId: string,
  eventTitle: string,
  organizerName: string,
  changes?: string[],
): Promise<void> {
  const data: PubSubMessageData = {
    action,
    eventId,
    eventTitle,
    organizerName,
    ...(changes ? { changes } : {}),
  };

  // Publish to GCP Cloud Pub/Sub
  await publishEventNotification(data as unknown as Record<string, unknown>);

  // In development, GCP cannot send a push webhook to localhost.
  // To make the notifications work seamlessly without ngrok, we simulate
  // the push delivery by calling the processor directly here.
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Local dev: simulating Pub/Sub push delivery instantly');
    void processNotificationMessage(data).catch((err) => 
      logger.error('Simulated push failed', { error: String(err) })
    );
  }
}

/* ----------------------------------------- subscribe (push endpoint worker) */

/** Human-readable notification content for each action type. */
function buildNotificationContent(
  data: PubSubMessageData,
): { title: string; body: string } {
  switch (data.action) {
    case 'event.cancelled':
      return {
        title: 'Event Cancelled',
        body: `"${data.eventTitle}" has been cancelled by ${data.organizerName}.`,
      };

    case 'event.updated':
      return {
        title: 'Event Updated',
        body: data.changes?.length
          ? `"${data.eventTitle}" has been updated: ${data.changes.join(', ')}.`
          : `"${data.eventTitle}" has been updated by ${data.organizerName}.`,
      };

    case 'event.reactivated':
      return {
        title: 'Event Back On!',
        body: `Great news — "${data.eventTitle}" is back on! ${data.organizerName} has reinstated the event.`,
      };

    default:
      return {
        title: 'Event Update',
        body: `Something changed for "${data.eventTitle}".`,
      };
  }
}

/**
 * Processes a Pub/Sub push message: loads every attendee of the event and
 * writes an in-app notification to their Firestore subcollection.
 *
 * Firestore writes are batched (up to 400 per batch) so even events with
 * hundreds of attendees are processed in a handful of round trips.
 */
export async function processNotificationMessage(
  rawData: PubSubMessageData,
): Promise<{ delivered: number }> {
  const { action, eventId } = rawData;
  const db = getDb();

  // 1. Load all RSVPs for the event.
  const rsvpSnapshot = await db
    .collection(EVENTS)
    .doc(eventId)
    .collection(RSVPS)
    .get();

  if (rsvpSnapshot.empty) {
    logger.info('No attendees to notify', { eventId, action });
    return { delivered: 0 };
  }

  const attendeeUids = rsvpSnapshot.docs.map((doc) => doc.id);
  const content = buildNotificationContent(rawData);

  // 2. Fan-out: write one notification per attendee, batched.
  let delivered = 0;

  for (let i = 0; i < attendeeUids.length; i += 400) {
    const batch = db.batch();
    const chunk = attendeeUids.slice(i, i + 400);

    for (const uid of chunk) {
      const notifRef = db
        .collection('users')
        .doc(uid)
        .collection(NOTIFICATIONS)
        .doc(); // auto-ID

      batch.set(notifRef, {
        type: action,
        title: content.title,
        body: content.body,
        eventId,
        eventTitle: rawData.eventTitle,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    delivered += chunk.length;
  }

  logger.info('Notifications delivered', {
    eventId,
    action,
    delivered,
    total: attendeeUids.length,
  });

  return { delivered };
}

/* ------------------------------------------- read (API for the frontend) */

/**
 * Lists notifications for a user, newest first. Capped at 50 to keep the
 * dropdown lightweight.
 */
export async function listNotifications(
  uid: string,
  limit = 50,
): Promise<NotificationRecord[]> {
  const snapshot = await getDb()
    .collection('users')
    .doc(uid)
    .collection(NOTIFICATIONS)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as DocumentData;
    return {
      id: doc.id,
      type: data.type as NotificationType,
      title: String(data.title ?? ''),
      body: String(data.body ?? ''),
      eventId: String(data.eventId ?? ''),
      eventTitle: String(data.eventTitle ?? ''),
      read: Boolean(data.read),
      createdAt: toIso(data.createdAt),
    };
  });
}

/** Number of unread notifications for the bell badge. */
export async function countUnread(uid: string): Promise<number> {
  const snapshot = await getDb()
    .collection('users')
    .doc(uid)
    .collection(NOTIFICATIONS)
    .where('read', '==', false)
    .count()
    .get();

  return snapshot.data().count;
}

/** Marks a single notification as read. */
export async function markAsRead(uid: string, notificationId: string): Promise<void> {
  await getDb()
    .collection('users')
    .doc(uid)
    .collection(NOTIFICATIONS)
    .doc(notificationId)
    .update({ read: true });
}

/** Marks all notifications as read in one batch. */
export async function markAllAsRead(uid: string): Promise<number> {
  const db = getDb();
  const snapshot = await db
    .collection('users')
    .doc(uid)
    .collection(NOTIFICATIONS)
    .where('read', '==', false)
    .get();

  if (snapshot.empty) return 0;

  for (let i = 0; i < snapshot.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(i, i + 400)) {
      batch.update(doc.ref, { read: true });
    }
    await batch.commit();
  }

  return snapshot.size;
}
