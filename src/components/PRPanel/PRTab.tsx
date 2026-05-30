/**
 * PRTab — shows PR metadata (author, dates, file stats).
 * Details data is fetched by PRPanel and passed as a prop.
 */
interface PRDetails {
  title: string
  number: number
  state: string
  html_url: string
  user: { login: string; avatar_url: string }
  created_at: string
  updated_at: string
  additions: number
  deletions: number
  changed_files: number
}

interface Props {
  details: PRDetails | null
  loading: boolean
  error: string | null
}

export default function PRTab({ details, loading, error }: Props) {
  if (loading) return <div className="prp-loading">Loading PR details…</div>
  if (error)   return <div className="prp-error">{error}</div>
  if (!details) return null

  const created = new Date(details.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
  const updated = new Date(details.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })

  return (
    <div>
      <h2 className="prp-title">{details.title}</h2>

      <div className="prp-meta-row">
        <img
          src={details.user.avatar_url}
          alt={details.user.login}
          className="prp-meta-avatar"
          width={22}
          height={22}
        />
        <span className="prp-meta-login">@{details.user.login}</span>
        <span className="prp-meta-sep">·</span>
        <span>Created {created}</span>
        <span className="prp-meta-sep">·</span>
        <span>Updated {updated}</span>
      </div>

      <div className="prp-file-stats">
        <span>{details.changed_files} file{details.changed_files !== 1 ? 's' : ''} changed</span>
        <span className="prp-stat-add">+{details.additions}</span>
        <span className="prp-stat-del">−{details.deletions}</span>
      </div>
    </div>
  )
}
