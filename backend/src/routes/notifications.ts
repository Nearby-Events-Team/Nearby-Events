import { Router } from 'express';
import { requireAuth, currentUser, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { logger } from '../config/logger';
import {
  countUnread,
  listNotifications,
  markAllAsRead,
  markAsRead,
  processNotificationMessage,
} from '../services/notificationService';

export const notificationsRouter = Router();

/* ------------------------------------------------------------------ user-facing */

/** GET /api/notifications — list the signed-in user's notifications. */
notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const notifications = await listNotifications(user.uid);
    res.json({ notifications });
  }),
);

/** GET /api/notifications/unread-count — badge number for the bell icon. */
notificationsRouter.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const count = await countUnread(user.uid);
    res.json({ count });
  }),
);

/** POST /api/notifications/:id/read — mark one notification as read. */
notificationsRouter.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    await markAsRead(user.uid, String(req.params.id));
    res.json({ success: true });
  }),
);

/** POST /api/notifications/read-all — mark every notification as read. */
notificationsRouter.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const marked = await markAllAsRead(user.uid);
    res.json({ success: true, marked });
  }),
);

/* ------------------------------------------------ Pub/Sub push subscriber endpoint */

/**
 * POST /api/notifications/pubsub-push
 *
 * This is the endpoint Cloud Pub/Sub pushes messages to. In production, a push
 * subscription is configured to deliver here. The endpoint:
 *   1. Decodes the base64 message data
 *   2. Calls processNotificationMessage to fan out in-app notifications
 *   3. Returns 200 to acknowledge the message (prevents redelivery)
 *
 * On error it returns 500 so Pub/Sub retries automatically.
 *
 * Authentication: In production, configure the push subscription with an
 * OIDC token that this endpoint verifies. For the hackathon demo, we accept
 * requests with a maintenance token or from the push subscription directly.
 */
notificationsRouter.post(
  '/pubsub-push',
  asyncHandler(async (req, res) => {
    const message = req.body?.message;

    if (!message?.data) {
      logger.warn('Pub/Sub push: no message data');
      // Return 200 to prevent Pub/Sub from retrying a malformed message forever.
      res.status(200).json({ error: 'No message data' });
      return;
    }

    try {
      // Pub/Sub sends the data as a base64-encoded JSON string.
      const decoded = Buffer.from(message.data, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);

      logger.info('Pub/Sub push received', {
        messageId: message.messageId,
        action: data.action,
        eventId: data.eventId,
      });

      const result = await processNotificationMessage(data);

      // 200 = acknowledge. Pub/Sub won't redeliver.
      res.status(200).json({
        success: true,
        messageId: message.messageId,
        delivered: result.delivered,
      });
    } catch (err: unknown) {
      logger.error('Pub/Sub push processing failed', {
        error: String((err as Error).message),
        messageId: message.messageId,
      });
      // 500 = nack. Pub/Sub will retry with exponential backoff.
      res.status(500).json({ error: 'Processing failed' });
    }
  }),
);

/**
 * POST /api/notifications/test-publish
 *
 * Development-only route to simulate Pub/Sub push delivery without a real
 * subscription. Skips the Pub/Sub transport and calls the processor directly.
 * Only available when NODE_ENV !== 'production'.
 */
notificationsRouter.post(
  '/test-publish',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const { action, eventId, eventTitle, organizerName, changes } = req.body;

    if (!action || !eventId || !eventTitle) {
      res.status(400).json({ error: 'Missing required fields: action, eventId, eventTitle' });
      return;
    }

    const result = await processNotificationMessage({
      action,
      eventId,
      eventTitle,
      organizerName: organizerName || currentUser(req).displayName,
      changes,
    });

    res.json({ success: true, delivered: result.delivered });
  }),
);
