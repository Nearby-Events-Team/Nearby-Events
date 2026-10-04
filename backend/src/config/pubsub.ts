import { PubSub, type Topic } from '@google-cloud/pubsub';
import { env } from './env';
import { logger } from './logger';

/**
 * Singleton Pub/Sub client. In local mode (no real GCP project) we skip
 * initialisation entirely and the publish helpers become fire-and-forget no-ops,
 * so the dev loop never depends on a running emulator.
 */
let client: PubSub | null = null;
const topicCache = new Map<string, Topic>();

/** The single topic every event-lifecycle notification flows through. */
export const EVENT_NOTIFICATIONS_TOPIC = 'event-notifications';

function getClient(): PubSub | null {
  // Off in local mode, against the emulators and in tests (see env.pubsubEnabled).
  if (!env.pubsubEnabled) return null;
  if (!client) {
    client = new PubSub({ projectId: env.projectId });
    logger.info('Pub/Sub client initialised', { projectId: env.projectId });
  }
  return client;
}

/**
 * Returns a topic handle, creating it lazily if it does not exist yet.
 *
 * Topic creation is idempotent on GCP — calling `createTopic` when the topic
 * already exists returns a `6 ALREADY_EXISTS` error that we catch and treat
 * as a cache miss.
 */
async function ensureTopic(name: string): Promise<Topic | null> {
  const ps = getClient();
  if (!ps) return null;

  const cached = topicCache.get(name);
  if (cached) return cached;

  const topic = ps.topic(name);

  try {
    const [exists] = await topic.exists();
    if (!exists) {
      await topic.create();
      logger.info('Pub/Sub topic created', { topic: name });
    }
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    // 6 = ALREADY_EXISTS — safe to ignore; anything else is a real problem.
    if (code !== 6) {
      logger.error('Failed to ensure Pub/Sub topic', {
        topic: name,
        error: String((err as Error).message),
      });
      return null;
    }
  }

  topicCache.set(name, topic);
  return topic;
}

/**
 * Publishes a JSON message to the event-notifications topic.
 *
 * Returns immediately (~5 ms). The message is buffered by the client library
 * and flushed to the Pub/Sub service asynchronously. Errors are logged but
 * never thrown — a failed notification must never block the organiser's request.
 */
export async function publishEventNotification(
  data: Record<string, unknown>,
): Promise<string | null> {
  const topic = await ensureTopic(EVENT_NOTIFICATIONS_TOPIC);

  if (!topic) {
    // Local mode or topic creation failed — log and move on.
    logger.info('Pub/Sub skipped (no topic)', { action: data.action, eventId: data.eventId });
    return null;
  }

  try {
    const messageId = await topic.publishMessage({
      json: data,
      attributes: {
        action: String(data.action ?? 'unknown'),
        eventId: String(data.eventId ?? ''),
      },
    });

    logger.info('Pub/Sub message published', {
      messageId,
      topic: EVENT_NOTIFICATIONS_TOPIC,
      action: data.action,
      eventId: data.eventId,
    });

    return messageId;
  } catch (err: unknown) {
    logger.error('Pub/Sub publish failed', {
      topic: EVENT_NOTIFICATIONS_TOPIC,
      action: data.action,
      error: String((err as Error).message),
    });
    return null;
  }
}

/**
 * Initialise the Pub/Sub subsystem. Called once at server start so the topic
 * exists before the first cancel/update request comes in.
 */
export async function initPubSub(): Promise<void> {
  if (!env.pubsubEnabled) {
    logger.info('Pub/Sub disabled (local mode, emulators or tests)');
    return;
  }
  await ensureTopic(EVENT_NOTIFICATIONS_TOPIC);
}
