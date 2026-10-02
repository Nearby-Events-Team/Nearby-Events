import {
  FieldValue,
  getDb,
  type DocumentData,
  type QueryDocumentSnapshot,
} from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import type { AuthUser } from '../middleware/auth';

const EVENTS = 'events';
const COMMENTS = 'comments';

export interface CommentRecord {
  id: string;
  eventId: string;
  parentId: string | null;   // null = top-level, string = reply to commentId
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  body: string;
  likeCount: number;
  replyCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  /** Populated per-request for the signed-in caller. */
  isAuthor?: boolean;
  isLiked?: boolean;
}

function toCommentRecord(doc: QueryDocumentSnapshot | DocumentData, id?: string): CommentRecord {
  const hasDataFn = typeof (doc as QueryDocumentSnapshot).data === 'function';
  const data = (hasDataFn ? (doc as QueryDocumentSnapshot).data() : doc) as DocumentData;
  const docId = id ?? (doc as QueryDocumentSnapshot).id;

  const toIso = (val: unknown): string | null => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
      return (val as { toDate: () => Date }).toDate().toISOString();
    }
    return null;
  };

  return {
    id: docId,
    eventId: String(data.eventId ?? ''),
    parentId: data.parentId ? String(data.parentId) : null,
    authorId: String(data.authorId ?? ''),
    authorName: String(data.authorName ?? 'Neighbour'),
    authorPhotoURL: data.authorPhotoURL ? String(data.authorPhotoURL) : null,
    body: String(data.body ?? ''),
    likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
    replyCount: typeof data.replyCount === 'number' ? data.replyCount : 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/** Annotate isAuthor / isLiked for the signed-in viewer. */
async function decorateForViewer(
  eventId: string,
  comments: CommentRecord[],
  viewerUid?: string,
): Promise<void> {
  if (!viewerUid || comments.length === 0) {
    for (const c of comments) {
      c.isAuthor = false;
      c.isLiked = false;
    }
    return;
  }

  const db = getDb();
  // Check likes in one batch read.
  const likeRefs = comments.map((c) =>
    db.collection(EVENTS).doc(eventId).collection(COMMENTS).doc(c.id).collection('likes').doc(viewerUid),
  );
  const likeSnaps = await db.getAll(...likeRefs);
  const likedIds = new Set(likeSnaps.filter((s) => s.exists).map((s) => s.ref.parent.parent!.id));

  for (const c of comments) {
    c.isAuthor = c.authorId === viewerUid;
    c.isLiked = likedIds.has(c.id);
  }
}

/** List top-level comments for an event, newest first. */
export async function listComments(eventId: string, viewerUid?: string): Promise<CommentRecord[]> {
  const snapshot = await getDb()
    .collection(EVENTS)
    .doc(eventId)
    .collection(COMMENTS)
    .where('parentId', '==', null)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const comments = snapshot.docs.map((doc) => toCommentRecord(doc));
  await decorateForViewer(eventId, comments, viewerUid);
  return comments;
}

/** List replies for a specific comment. */
export async function listReplies(eventId: string, commentId: string, viewerUid?: string): Promise<CommentRecord[]> {
  const snapshot = await getDb()
    .collection(EVENTS)
    .doc(eventId)
    .collection(COMMENTS)
    .where('parentId', '==', commentId)
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get();

  const replies = snapshot.docs.map((doc) => toCommentRecord(doc));
  await decorateForViewer(eventId, replies, viewerUid);
  return replies;
}

/** Post a top-level comment or a reply. */
export async function addComment(
  eventId: string,
  body: string,
  user: AuthUser,
  parentId?: string,
): Promise<CommentRecord> {
  const db = getDb();

  // Verify event exists.
  const eventDoc = await db.collection(EVENTS).doc(eventId).get();
  if (!eventDoc.exists) throw AppError.notFound('That event does not exist.');

  const trimmed = body.trim();
  if (trimmed.length < 1) throw AppError.badRequest('Comment cannot be empty.');
  if (trimmed.length > 2000) throw AppError.badRequest('Comment must be 2000 characters or fewer.');

  if (parentId) {
    const parentSnap = await db.collection(EVENTS).doc(eventId).collection(COMMENTS).doc(parentId).get();
    if (!parentSnap.exists) throw AppError.notFound('The comment you replied to no longer exists.');
    // Prevent replying to a reply (keep it one level deep like Reddit/YouTube).
    const parentData = parentSnap.data() as DocumentData;
    if (parentData.parentId !== null) throw AppError.badRequest('You can only reply to top-level comments.');
  }

  const payload = {
    eventId,
    parentId: parentId ?? null,
    authorId: user.uid,
    authorName: user.displayName,
    authorPhotoURL: user.photoURL,
    body: trimmed,
    likeCount: 0,
    replyCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection(EVENTS).doc(eventId).collection(COMMENTS).add(payload);

  // Increment the parent's replyCount atomically.
  if (parentId) {
    await db
      .collection(EVENTS)
      .doc(eventId)
      .collection(COMMENTS)
      .doc(parentId)
      .update({ replyCount: FieldValue.increment(1) });
  }

  const snap = await ref.get();
  const record = toCommentRecord(snap);
  record.isAuthor = true;
  record.isLiked = false;

  logger.info('Comment added', { eventId, commentId: ref.id, parentId: parentId ?? null, uid: user.uid });
  return record;
}

/** Edit own comment body. */
export async function editComment(
  eventId: string,
  commentId: string,
  body: string,
  user: AuthUser,
): Promise<CommentRecord> {
  const db = getDb();
  const ref = db.collection(EVENTS).doc(eventId).collection(COMMENTS).doc(commentId);
  const snap = await ref.get();

  if (!snap.exists) throw AppError.notFound('Comment not found.');

  const data = snap.data() as DocumentData;
  if (data.authorId !== user.uid) throw AppError.forbidden('You can only edit your own comments.');

  const trimmed = body.trim();
  if (trimmed.length < 1) throw AppError.badRequest('Comment cannot be empty.');
  if (trimmed.length > 2000) throw AppError.badRequest('Comment must be 2000 characters or fewer.');

  await ref.update({ body: trimmed, updatedAt: FieldValue.serverTimestamp() });
  const fresh = await ref.get();
  const record = toCommentRecord(fresh);
  record.isAuthor = true;

  return record;
}

/** Delete own comment (also deletes its replies). */
export async function deleteComment(
  eventId: string,
  commentId: string,
  user: AuthUser,
): Promise<void> {
  const db = getDb();
  const ref = db.collection(EVENTS).doc(eventId).collection(COMMENTS).doc(commentId);
  const snap = await ref.get();

  if (!snap.exists) throw AppError.notFound('Comment not found.');

  const data = snap.data() as DocumentData;
  if (data.authorId !== user.uid) throw AppError.forbidden('You can only delete your own comments.');

  // If it's a reply, decrement the parent replyCount.
  if (data.parentId) {
    await db
      .collection(EVENTS)
      .doc(eventId)
      .collection(COMMENTS)
      .doc(String(data.parentId))
      .update({ replyCount: FieldValue.increment(-1) })
      .catch(() => undefined); // parent might already be deleted — that's fine
  }

  // Delete all sub-replies first.
  const replies = await db.collection(EVENTS).doc(eventId).collection(COMMENTS)
    .where('parentId', '==', commentId).get();

  const batch = db.batch();
  for (const replyDoc of replies.docs) batch.delete(replyDoc.ref);
  batch.delete(ref);
  await batch.commit();

  logger.info('Comment deleted', { eventId, commentId, uid: user.uid });
}

/** Toggle like on a comment. */
export async function toggleCommentLike(
  eventId: string,
  commentId: string,
  user: AuthUser,
): Promise<{ liked: boolean; likeCount: number }> {
  const db = getDb();
  const commentRef = db.collection(EVENTS).doc(eventId).collection(COMMENTS).doc(commentId);
  const likeRef = commentRef.collection('likes').doc(user.uid);

  const commentSnap = await commentRef.get();
  if (!commentSnap.exists) throw AppError.notFound('Comment not found.');

  const likeSnap = await likeRef.get();
  const alreadyLiked = likeSnap.exists;

  if (alreadyLiked) {
    await likeRef.delete();
    await commentRef.update({ likeCount: FieldValue.increment(-1) });
  } else {
    await likeRef.set({ uid: user.uid, createdAt: FieldValue.serverTimestamp() });
    await commentRef.update({ likeCount: FieldValue.increment(1) });
  }

  const fresh = await commentRef.get();
  const freshData = fresh.data() as DocumentData;
  const likeCount = typeof freshData.likeCount === 'number' ? freshData.likeCount : 0;

  return { liked: !alreadyLiked, likeCount };
}
