interface WhatsNewStepProps {
  onDismiss: () => void
  onGetStarted: () => void
  onPrev: () => void
}

export default function WhatsNewStep({ onDismiss, onGetStarted, onPrev }: WhatsNewStepProps) {
  return (
    <div className="onboarding-step whatsnew-step">
      <div className="onboarding-step-icon" aria-hidden="true">🎉</div>
      <h2>What&rsquo;s New in v2026.07.005</h2>

      <div className="whatsnew-content">
        <div className="whatsnew-item">
          <h3>Validator Onboarding Workflow</h3>
          <p>
            New validators can now answer questions about their expertise to get personalized PR recommendations
            matched to their language preferences, severity interests, and experience level.
          </p>
        </div>

        <div className="whatsnew-item">
          <h3>User Preferences Storage</h3>
          <p>
            Your language and severity preferences are now saved to your profile, so you see the most relevant PRs
            every time you log in. Update anytime from the navigation menu.
          </p>
        </div>

        <div className="whatsnew-item">
          <h3>Slack Community Channel</h3>
          <p>
            The OASIS community now has a dedicated Slack channel. Come say hi, ask questions, and collaborate with
            other validators, maintainers, and project leads.
          </p>
        </div>

        <div className="whatsnew-item">
          <h3>Version Tracking</h3>
          <p>
            The app now displays version information in the footer so you know exactly which release you&rsquo;re
            running.
          </p>
        </div>
      </div>

      <div className="onboarding-step-buttons">
        <button type="button" className="btn btn-secondary" onClick={onPrev}>
          &larr; Back
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDismiss}>
          Dismiss
        </button>
        <button type="button" className="btn btn-primary" onClick={onGetStarted}>
          Get started &rarr;
        </button>
      </div>
    </div>
  )
}
