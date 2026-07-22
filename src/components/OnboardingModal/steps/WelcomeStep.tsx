export default function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-icon" aria-hidden="true">👋</div>
      <h2>Welcome to OASIS</h2>
      <p>
        Great to see you here! OASIS helps the open source community validate and fix security vulnerabilities.
      </p>
      <p>
        In the next few steps, we'll learn about your expertise so we can show you PRs you&rsquo;ll love
        reviewing and validating.
      </p>
      <div className="onboarding-step-buttons">
        <button className="btn btn-primary" onClick={onNext}>
          Let&rsquo;s go &rarr;
        </button>
      </div>
    </div>
  )
}
