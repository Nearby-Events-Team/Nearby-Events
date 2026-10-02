import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, currentUser, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import {
  addComment,
  deleteComment,
  editComment,
  listComments,
  listReplies,
  toggleCommentLike,
} from '../services/commentService';

export const commentsRouter = Router({ mergeParams: true });

const bodySchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty.').max(2000, 'Max 2000 characters.'),
});

const replySchema = bodySchema.extend({
  parentId: z.string().optional(),
});

/** GET /api/events/:eventId/comments — top-level thread list */
commentsRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const eventId = String(req.params.eventId);
    const comments = await listComments(eventId, req.user?.uid);
    res.json({ comments, total: comments.length });
  }),
);

/** GET /api/events/:eventId/comments/:commentId/replies */
commentsRouter.get(
  '/:commentId/replies',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { eventId, commentId } = req.params as { eventId: string; commentId: string };
    const replies = await listReplies(eventId, commentId, req.user?.uid);
    res.json({ replies, total: replies.length });
  }),
);

/** POST /api/events/:eventId/comments — new comment or reply (parentId in body) */
commentsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const { body, parentId } = replySchema.parse(req.body);
    const eventId = String(req.params.eventId);

    const comment = await addComment(eventId, body, user, parentId);
    res.status(201).json({ comment });
  }),
);

/** PATCH /api/events/:eventId/comments/:commentId — edit own comment */
commentsRouter.patch(
  '/:commentId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const { body } = bodySchema.parse(req.body);
    const { eventId, commentId } = req.params as { eventId: string; commentId: string };

    const comment = await editComment(eventId, commentId, body, user);
    res.json({ comment });
  }),
);

/** DELETE /api/events/:eventId/comments/:commentId */
commentsRouter.delete(
  '/:commentId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const { eventId, commentId } = req.params as { eventId: string; commentId: string };

    await deleteComment(eventId, commentId, user);
    res.status(204).send();
  }),
);

/** POST /api/events/:eventId/comments/:commentId/like — toggle like */
commentsRouter.post(
  '/:commentId/like',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const { eventId, commentId } = req.params as { eventId: string; commentId: string };

    const result = await toggleCommentLike(eventId, commentId, user);
    res.json(result);
  }),
);
