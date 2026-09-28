/**
 * CommentsTab — PR comments with OASIS vote highlighting and reaction bar.
 * Fetches /api/pr-panel/:id/comments. Refetches when refetchTrigger increments.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { renderMarkdown } from './renderMarkdown'

interface Reactions {
  total_count: number
  '+1': number
  '-1': number
  laugh: number
  hooray: number
  confused: number
  heart: number
  rocket: number
  eyes: number
}

interface Comment {
  id: number
  user: { login: string; avatar_url: string }
  body: string
  created_at: string
  reactions: Reactions
  oasis_decision: 'accept' | 'modify' | 'reject' | null
}

interface Props {
  prId: number
  refetchTrigger: number
  onCountLoaded: (n: number) => void
  onSignInRequired?: () => void
}

const REACTION_EMOJIS: { key: keyof Omit<Reactions, 'total_count'>; emoji: string; label: string }[] = [
  { key: '+1',      emoji: '👍', label: 'thumbs up' },
  { key: '-1',      emoji: '👎', label: 'thumbs down' },
  { key: 'laugh',   emoji: '😄', label: 'laugh' },
  { key: 'hooray',  emoji: '🎉', label: 'hooray' },
  { key: 'confused',emoji: '😕', label: 'confused' },
  { key: 'heart',   emoji: '❤️', label: 'heart' },
  { key: 'rocket',  emoji: '🚀', label: 'rocket' },
  { key: 'eyes',    emoji: '👀', label: 'eyes' },
]

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)  return `${d}d ago`
  return new Date(dateStr).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export default function CommentsTab({ prId, refetchTrigger, onCountLoaded, onSignInRequired }: Props) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [reactionErrors, setReactionErrors] = useState<Map<number, string>>(new Map())
  const [pendingReactions, setPendingReactions] = useState<Set<number>>(new Set())
  const [viewerReactions, setViewerReactions] = useState<Map<number, string>>(new Map())

  // Fetch CSRF token once the user is authenticated
  useEffect(() => {
    if (!user) return
    fetch('/api/csrf', { credentials: 'include' })
      .then(r => r.json() as Promise<{ token: string }>)
      .then(d => setCsrfToken(d.token))
      .catch(() => {/* non-fatal — reactions simply won't be available */})
  }, [user])

  const fetchComments = useCallback(() => {
    setLoading(true)
    fetch(`/api/pr-panel/${prId}/comments`)
      .then(r => r.json() as Promise<{ ok: boolean; comments?: Comment[]; error?: string }>)
      .then(d => {
        if (!d.ok) { setError(d.error ?? 'Failed to load comments'); return }
        const c = d.comments ?? []
        setComments(c)
        onCountLoaded(c.length)
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [prId, onCountLoaded])

  useEffect(() => { fetchComments() }, [fetchComments, refetchTrigger])

  async function handleReact(commentId: number, reaction: string) {
    if (!user) {
      if (onSignInRequired) {
        onSignInRequired()
      } else {
        window.location.href = '/api/auth/login'
      }
      return
    }
    if (pendingReactions.has(commentId) || viewerReactions.has(commentId)) return

    setPendingReactions(prev => new Set(prev).add(commentId))
    setReactionErrors(prev => {
      const next = new Map(prev)
      next.delete(commentId)
      return next
    })

    try {
      const res = await fetch(`/api/pr-panel/${prId}/react`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ comment_id: commentId, reaction }),
      })
      const data = await res.json() as {
        ok: boolean
        created?: boolean
        reaction?: string
        error?: string
      }

      if (res.status === 403) {
        setReactionErrors(prev => new Map(prev).set(commentId, 'reauth'))
        return
      }

      if (!res.ok) {
        setReactionErrors(prev => new Map(prev).set(commentId, data.error ?? 'Could not add reaction'))
        return
      }

      const selectedReaction = data.reaction ?? reaction
      setViewerReactions(prev => new Map(prev).set(commentId, selectedReaction))

      if (data.created) {
        setComments(prev => prev ? prev.map(c => {
          if (c.id !== commentId) return c
          const r = { ...c.reactions }
          const k = selectedReaction as keyof Omit<Reactions, 'total_count'>
          r[k] = (r[k] ?? 0) + 1
          r.total_count += 1
          return { ...c, reactions: r }
        }) : null)
      }
    } catch {
      setReactionErrors(prev => new Map(prev).set(commentId, 'Could not add reaction'))
    } finally {
      setPendingReactions(prev => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
    }
  }

  if (loading) return <div className="prp-loading">Loading comments…</div>
  if (error)   return <div className="prp-error">{error}</div>
  if (!comments || comments.length === 0) return <p className="prp-no-data">No comments yet.</p>

  return (
    <div>
      {comments.map(c => {
        const isOasis = c.oasis_decision !== null
        const reauthError = reactionErrors.get(c.id) === 'reauth'
        const reactionError = reactionErrors.get(c.id)
        const pending = pendingReactions.has(c.id)
        const viewerReaction = viewerReactions.get(c.id)

        return (
          <div key={c.id} className="prp-comment">
            <div className="prp-comment-header">
              <img
                src={c.user.avatar_url}
                alt={c.user.login}
                className="prp-comment-avatar"
                width={28}
                height={28}
              />
              <span className="prp-comment-login">@{c.user.login}</span>
              <span className="prp-comment-date">{formatRelative(c.created_at)}</span>
              {isOasis && c.oasis_decision && (
                <span className={`prp-oasis-badge prp-oasis-badge--${c.oasis_decision}`}>
                  {c.oasis_decision.charAt(0).toUpperCase() + c.oasis_decision.slice(1)}
                </span>
              )}
            </div>

            {isOasis ? (
              <div className="prp-oasis-comment">
                <div className="prp-comment-body prp-md">{renderMarkdown(c.body)}</div>
              </div>
            ) : (
              <div className="prp-comment-body prp-md">{renderMarkdown(c.body)}</div>
            )}

            <div className="prp-reactions">
              {REACTION_EMOJIS.map(({ key, emoji, label }) => {
                const count = c.reactions[key]
                if (count === 0 && !user) return null
                return (
                  <button
                    key={key}
                    className={`prp-reaction-btn${viewerReaction === key ? ' prp-reaction-btn--active' : ''}`}
                    onClick={() => handleReact(c.id, key)}
                    disabled={pending || viewerReaction !== undefined}
                    title={viewerReaction ? `You reacted with ${viewerReaction}` : label}
                    aria-label={`${label} (${count})`}
                    aria-pressed={viewerReaction === key}
                  >
                    {emoji} {count > 0 && <span className="prp-reaction-count">{count}</span>}
                  </button>
                )
              })}
            </div>

            {reauthError && (
              <p className="prp-reaction-note">
                Re-authenticate to enable reactions —{' '}
                <a href="/api/auth/login" className="prp-gh-link">Sign in again</a> with the
                new scope.
              </p>
            )}
            {reactionError && !reauthError && (
              <p className="prp-reaction-note" role="alert">{reactionError}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
