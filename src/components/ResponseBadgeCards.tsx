import './ContributorPanel/ContributorPanelRefresh.css'

export interface ResponseBadgeCriterion {
  label: string
  current: number
  target: number
  unit: 'count' | 'percent'
  met: boolean
}

export interface ResponseBadge {
  id: 'validation_contributor' | 'first_responder' | 'fast_responder' | 'coverage_contributor'
  name: string
  kind: 'achievement' | 'activity'
  state: 'active' | 'locked'
  description: string
  evidence: string
  criteria: ResponseBadgeCriterion[]
}

export interface ResponseBadgeSummary {
  badges: ResponseBadge[]
  calculatedAt: string
  requestClockMeaning: string
}

const icons: Record<ResponseBadge['id'], string> = {
  validation_contributor: '✓',
  first_responder: '⚡',
  fast_responder: '⏱',
  coverage_contributor: '🛟',
}

function criterionValue(criterion: ResponseBadgeCriterion): string {
  const suffix = criterion.unit === 'percent' ? '%' : ''
  return `${criterion.current}${suffix} / ${criterion.target}${suffix}`
}

export default function ResponseBadgeCards({ summary, headingLevel = 3, compact = false }: { summary: ResponseBadgeSummary; headingLevel?: 3 | 5; compact?: boolean }) {
  const BadgeHeading = headingLevel === 5 ? 'h5' : 'h3'
  return <>
    {!compact && <div className="cp-response-intro">
      <strong>Response recognition</strong>
      <span>Recorded validations count past work. Timed badges recognize prompt coverage. None changes reputation, ranking, vote weight, or permissions.</span>
    </div>}
    <div className="cp-response-badge-list">
      {summary.badges.map(badge => <article
        key={badge.id}
        className={`cp-response-badge-card cp-response-badge-card--${badge.state}`}
      >
        <div className="cp-response-badge-icon" aria-hidden="true">{icons[badge.id]}</div>
        <div className="cp-response-badge-body">
          <div className="cp-response-badge-heading">
            <BadgeHeading>{badge.name}</BadgeHeading>
            <span className={`cp-response-badge-state cp-response-badge-state--${badge.state}`}>
              {badge.state === 'active' ? 'Earned' : 'Not yet earned'}
            </span>
          </div>
          <p>{badge.description}</p>
          <strong className="cp-response-badge-evidence">{badge.evidence}</strong>
          {(badge.kind === 'activity' || badge.state !== 'active') && <div className="cp-response-criteria">
            {badge.criteria.map(criterion => {
              const progress = criterion.target > 0
                ? Math.min(100, Math.round((criterion.current / criterion.target) * 100))
                : 0
              return <div key={criterion.label} className="cp-response-criterion">
                <span><small>{criterion.label}</small><b>{criterionValue(criterion)}</b></span>
                <div
                  className={`cp-response-progress${criterion.met ? ' cp-response-progress--met' : ''}`}
                  role="progressbar"
                  aria-label={criterion.label}
                  aria-valuemin={0}
                  aria-valuemax={criterion.target}
                  aria-valuenow={Math.min(criterion.current, criterion.target)}
                ><span style={{ width: `${progress}%` }} /></div>
              </div>
            })}
          </div>}
        </div>
      </article>)}
    </div>
    <div className="cp-response-note">
      <strong>How is past work counted?</strong>
      <span>{summary.requestClockMeaning}</span>
      <span>PR authors and cancelled or deleted work do not qualify. Timed badges also exclude duplicate PRs.</span>
    </div>
  </>
}
