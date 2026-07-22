interface ReadyStepProps {
  languages: string[]
  severities: string[]
  experience: string | null
  onNext: () => void
  onPrev: () => void
}

export default function ReadyStep({
  languages,
  severities,
  experience,
  onNext,
  onPrev,
}: ReadyStepProps) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-icon" aria-hidden="true">✨</div>
      <h2>You&rsquo;re all set!</h2>
      <p>Here&rsquo;s what we found:</p>

      <div className="onboarding-summary">
        {languages.length > 0 && (
          <div className="summary-item">
            <span className="summary-label">Languages:</span>
            <span className="summary-value">{languages.join(', ')}</span>
          </div>
        )}
        {severities.length > 0 && (
          <div className="summary-item">
            <span className="summary-label">Severities:</span>
            <span className="summary-value">{severities.join(', ')}</span>
          </div>
        )}
        {experience && (
          <div className="summary-item">
            <span className="summary-label">Experience:</span>
            <span className="summary-value">
              {experience === 'new'
                ? 'New to validators'
                : experience === 'some'
                  ? 'Some experience'
                  : 'Experienced validator'}
            </span>
          </div>
        )}
      </div>

      <p>
        We&rsquo;ll use these preferences to recommend PRs that match your interests and expertise.
        You can update these preferences anytime from the navigation menu.
      </p>

      <div className="onboarding-step-buttons">
        <button className="btn btn-secondary" onClick={onPrev}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Next →
        </button>
      </div>
    </div>
  )
}
