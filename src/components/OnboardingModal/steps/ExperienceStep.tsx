const EXPERIENCE_OPTIONS = [
  {
    id: 'new',
    label: 'New to validators',
    description: 'I\'m new to security code review and want to learn',
  },
  {
    id: 'some',
    label: 'Some experience',
    description: 'I\'ve reviewed code for security before',
  },
  {
    id: 'experienced',
    label: 'Experienced validator',
    description: 'I\'m a seasoned security code reviewer',
  },
]

interface ExperienceStepProps {
  selected: string | null
  onSelect: (exp: string | null) => void
  onNext: () => void
  onPrev: () => void
}

export default function ExperienceStep({ selected, onSelect, onNext, onPrev }: ExperienceStepProps) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-icon" aria-hidden="true">🎓</div>
      <h2>What&rsquo;s your experience level?</h2>
      <p>This helps us suggest appropriate PRs and guidance for your skill level.</p>

      <div className="onboarding-options">
        {EXPERIENCE_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={`onboarding-option ${selected === option.id ? 'selected' : ''}`}
            onClick={() => onSelect(option.id)}
          >
            <div className="onboarding-option-label">{option.label}</div>
            <div className="onboarding-option-description">{option.description}</div>
          </button>
        ))}
      </div>

      <p className="onboarding-hint">Optional — skip if you prefer not to specify</p>

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
