import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Reply,
  Send,
  Trash2,
} from 'lucide-react';
import { Avatar, Card } from '@/components/ui/Primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import { cn, formatRelative } from '@/lib/utils';
import type { CommentRecord } from '@/lib/types';

/* ---------------------------------------------------------------- helpers */

function CommentTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Auto-grow
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full resize-none rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink ring-1 ring-inset ring-border transition-shadow placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
    />
  );
}

/* ---------------------------------------------------------------- like btn */

function LikeButton({
  count,
  liked,
  disabled,
  onClick,
}: {
  count: number;
  liked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={liked}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 ring-1 ring-inset',
        liked
          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/25 hover:bg-rose-500/18'
          : 'bg-surface-sunken text-ink-soft ring-border hover:bg-surface hover:text-ink hover:ring-border-strong',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      <Heart
        className={cn('h-3.5 w-3.5', liked && 'fill-current')}
        aria-hidden="true"
      />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

/* ---------------------------------------------------------------- compose */

function CommentCompose({
  eventId,
  parentId,
  placeholder = 'Add a comment…',
  onAdded,
  onCancel,
  autoFocus = false,
}: {
  eventId: string;
  parentId?: string;
  placeholder?: string;
  onAdded: (comment: CommentRecord) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const { comment } = await api.addComment(eventId, body, parentId);
      setBody('');
      onAdded(comment);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not post comment.';
      toast.error('Comment failed', message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-soft ring-1 ring-inset ring-border">
        <a href="/login" className="font-semibold text-brand hover:text-brand-hover">
          Sign in
        </a>{' '}
        to join the conversation.
      </p>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar name={user.displayName ?? 'You'} src={user.photoURL} size="sm" className="shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <CommentTextarea
          value={body}
          onChange={setBody}
          placeholder={placeholder}
          disabled={busy}
          autoFocus={autoFocus}
        />
        {(body.trim() || onCancel) && (
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={!body.trim()}
              loading={busy}
              loadingLabel="Posting…"
              onClick={() => void submit()}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {parentId ? 'Reply' : 'Comment'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- single comment */

function CommentItem({
  comment,
  eventId,
  onDeleted,
  onEdited,
  onLiked,
}: {
  comment: CommentRecord;
  eventId: string;
  onDeleted: (id: string) => void;
  onEdited: (updated: CommentRecord) => void;
  onLiked: (id: string, liked: boolean, likeCount: number) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [replyOpen, setReplyOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replies, setReplies] = useState<CommentRecord[]>(comment.replies ?? []);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen]);

  const loadReplies = useCallback(async () => {
    if (loadingReplies) return;
    setLoadingReplies(true);
    try {
      const result = await api.listReplies(eventId, comment.id, Boolean(user));
      setReplies(result.replies);
      setRepliesOpen(true);
    } catch {
      toast.error('Could not load replies', '');
    } finally {
      setLoadingReplies(false);
    }
  }, [eventId, comment.id, user, loadingReplies, toast]);

  const toggleReplies = () => {
    if (!repliesOpen) {
      void loadReplies();
    } else {
      setRepliesOpen(false);
    }
  };

  const handleLike = async () => {
    if (!user) {
      toast.info('Sign in to like', '');
      return;
    }
    setLikeBusy(true);
    try {
      const { liked, likeCount } = await api.toggleCommentLike(eventId, comment.id);
      onLiked(comment.id, liked, likeCount);
    } catch {
      toast.error('Could not like comment', '');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleEdit = async () => {
    if (!editBody.trim()) return;
    setEditBusy(true);
    try {
      const { comment: updated } = await api.editComment(eventId, comment.id, editBody);
      onEdited(updated);
      setEditing(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not edit comment.';
      toast.error('Edit failed', message);
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    setDeleteBusy(true);
    try {
      await api.deleteComment(eventId, comment.id);
      onDeleted(comment.id);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete comment.';
      toast.error('Delete failed', message);
      setDeleteBusy(false);
    }
  };

  const handleReplyAdded = (newReply: CommentRecord) => {
    setReplies((prev) => [...prev, newReply]);
    setRepliesOpen(true);
    setReplyOpen(false);
  };

  const isOwner = comment.isAuthor || comment.authorId === user?.uid;
  const relTime = comment.createdAt ? formatRelative(comment.createdAt) : '';
  const wasEdited =
    comment.updatedAt &&
    comment.createdAt &&
    comment.updatedAt !== comment.createdAt;

  return (
    <div className={cn('group', deleteBusy && 'opacity-50 pointer-events-none')}>
      <div className="flex gap-3">
        <Avatar name={comment.authorName} src={comment.authorPhotoURL} size="sm" className="shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-bold text-ink">{comment.authorName}</span>
            <span className="text-xs text-ink-muted">{relTime}</span>
            {wasEdited && <span className="text-xs text-ink-muted italic">(edited)</span>}
          </div>

          {/* Body or edit form */}
          {editing ? (
            <div className="mt-1.5 space-y-2">
              <CommentTextarea
                value={editBody}
                onChange={setEditBody}
                placeholder="Edit your comment…"
                disabled={editBusy}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setEditing(false); setEditBody(comment.body); }}
                  disabled={editBusy}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!editBody.trim() || editBody === comment.body}
                  loading={editBusy}
                  loadingLabel="Saving…"
                  onClick={() => void handleEdit()}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink whitespace-pre-line">{comment.body}</p>
          )}

          {/* Actions row */}
          {!editing && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <LikeButton
                count={comment.likeCount}
                liked={Boolean(comment.isLiked)}
                disabled={likeBusy}
                onClick={() => void handleLike()}
              />

              {/* Reply — only on top-level comments */}
              {comment.parentId === null && (
                <button
                  type="button"
                  onClick={() => setReplyOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-soft ring-1 ring-inset ring-border bg-surface-sunken transition-all hover:text-ink hover:ring-border-strong"
                >
                  <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                  Reply
                </button>
              )}

              {/* Show/hide replies */}
              {comment.parentId === null && comment.replyCount > 0 && (
                <button
                  type="button"
                  onClick={toggleReplies}
                  disabled={loadingReplies}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-hover transition-colors"
                >
                  {repliesOpen
                    ? <><ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> Hide replies</>
                    : <><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> {loadingReplies ? 'Loading…' : `${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}</>
                  }
                </button>
              )}

              {/* Owner menu */}
              {isOwner && (
                <div className="relative ml-auto" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Comment options"
                    className="rounded-full p-1 text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-surface-sunken hover:text-ink transition-all"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-xl bg-surface shadow-md ring-1 ring-border">
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); setEditing(true); setEditBody(comment.body); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-sunken"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reply compose */}
          {replyOpen && (
            <div className="mt-3">
              <CommentCompose
                eventId={eventId}
                parentId={comment.id}
                placeholder={`Reply to ${comment.authorName}…`}
                onAdded={handleReplyAdded}
                onCancel={() => setReplyOpen(false)}
                autoFocus
              />
            </div>
          )}

          {/* Inline replies thread */}
          {repliesOpen && replies.length > 0 && (
            <div className="mt-4 space-y-4 border-l-2 border-border pl-4">
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  eventId={eventId}
                  onDeleted={(id) => setReplies((prev) => prev.filter((r) => r.id !== id))}
                  onEdited={(updated) =>
                    setReplies((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
                  }
                  onLiked={(id, liked, likeCount) =>
                    setReplies((prev) =>
                      prev.map((r) => (r.id === id ? { ...r, isLiked: liked, likeCount } : r)),
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- main section */

export function CommentsSection({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    api
      .listComments(eventId, Boolean(user))
      .then(({ comments: loaded }) => {
        if (active) setComments(loaded);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [eventId, user]);

  const handleAdded = (comment: CommentRecord) => {
    setComments((prev) => [comment, ...prev]);
    toast.success('Comment posted', '');
  };

  const handleDeleted = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    toast.info('Comment deleted', '');
  };

  const handleEdited = (updated: CommentRecord) => {
    setComments((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  };

  const handleLiked = (id: string, liked: boolean, likeCount: number) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, isLiked: liked, likeCount } : c)));
  };

  return (
    <section className="mt-10" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="flex items-center gap-2 text-display-sm">
        <MessageCircle className="h-5 w-5 text-brand" aria-hidden="true" />
        Community Q&amp;A
        {comments.length > 0 && (
          <span className="text-sm font-normal text-ink-muted">({comments.length})</span>
        )}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Ask the organiser a question, or share what you know about this event.
      </p>

      {/* Compose box */}
      <div className="mt-5">
        <CommentCompose
          eventId={eventId}
          placeholder="Ask a question or leave a comment…"
          onAdded={handleAdded}
        />
      </div>

      {/* Comment list */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-surface-sunken" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-28 rounded bg-surface-sunken" />
                  <div className="h-4 w-full rounded bg-surface-sunken" />
                  <div className="h-4 w-3/4 rounded bg-surface-sunken" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <Card className="p-4 text-sm text-ink-soft">
            Could not load comments. Refresh the page to try again.
          </Card>
        ) : comments.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageCircle className="h-8 w-8 text-ink-muted" aria-hidden="true" />
            <p className="font-semibold text-ink">No comments yet</p>
            <p className="text-sm text-ink-soft">Be the first to ask a question or start the conversation!</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                eventId={eventId}
                onDeleted={handleDeleted}
                onEdited={handleEdited}
                onLiked={handleLiked}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
