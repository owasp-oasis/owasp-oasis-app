const SEVERITIES = [
  { id: 'critical', label: 'Critical', color: '#dc2626' },
  { id: 'high', label: 'High', color: '#ea580c' },
  { id: 'medium', label: 'Medium', color: '#ca8a04' },
  { id: 'low', label: 'Low', color: '#16a34a' },
]

interface SeverityStepProps {
  selected: string[]
  onSelect: (sevs: string[]) => void
  onNext: () => void
  onPrev: () => void
}

export default function SeverityStep({ selected, onSelect, onNext, onPrev }: SeverityStepProps) {
  const toggleSeverity = (severity: string) => {
    if (selected.includes(severity)) {
      onSelect(selected.filter((s) => s !== severity))
    } else {
      onSelect([...selected, severity])
    }
  }

  return (
    <div className="onboarding-step">
      <div className="onboarding-step-icon" aria-hidden="true">⚠️</div>
      <h2>What severity vulnerabilities interest you?</h2>
      <p>Select one or more severity levels. We&rsquo;ll prioritize PRs with these vulnerability severities.</p>

      <div className="onboarding-severities">
        {SEVERITIES.map((severity) => (
          <button
            key={severity.id}
            className={`onboarding-severity ${selected.includes(severity.id) ? 'selected' : ''}`}
            onClick={() => toggleSeverity(severity.id)}
            style={
              selected.includes(severity.id) ? { borderColor: severity.color, backgroundColor: `${severity.color}10` } : {}
            }
          >
            <span className="severity-color" style={{ backgroundColor: severity.color }} />
            {severity.label}
          </button>
        ))}
      </div>

      <p className="onboarding-hint">Optional — skip to see all severity levels</p>

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
