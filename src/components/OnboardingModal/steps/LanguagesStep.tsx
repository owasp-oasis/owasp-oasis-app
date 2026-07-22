const LANGUAGES = [
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'Go',
  'Rust',
  'Ruby',
  'C++',
  'C',
  'Swift',
  'Kotlin',
]

interface LanguagesStepProps {
  selected: string[]
  onSelect: (langs: string[]) => void
  onNext: () => void
  onPrev: () => void
}

export default function LanguagesStep({ selected, onSelect, onNext, onPrev }: LanguagesStepProps) {
  const toggleLanguage = (lang: string) => {
    if (selected.includes(lang)) {
      onSelect(selected.filter((s) => s !== lang))
    } else {
      onSelect([...selected, lang])
    }
  }

  return (
    <div className="onboarding-step">
      <div className="onboarding-step-icon" aria-hidden="true">🔤</div>
      <h2>Which programming languages do you know?</h2>
      <p>Select one or more languages you&rsquo;re familiar with. We&rsquo;ll show you PRs in these languages.</p>

      <div className="onboarding-tags">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            className={`onboarding-tag ${selected.includes(lang) ? 'selected' : ''}`}
            onClick={() => toggleLanguage(lang)}
          >
            {lang}
          </button>
        ))}
      </div>

      <p className="onboarding-hint">Optional — skip if you want to see all languages</p>

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
