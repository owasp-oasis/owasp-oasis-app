import { BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ReviewerOnboardingPrompt() {
  return <aside className="ws-reviewer-guide" aria-label="Reviewer onboarding">
    <BookOpen size={18} aria-hidden="true" />
    <p><strong>New to reviewing?</strong> <Link to="/quick-start">Start here</Link><span aria-hidden="true"> · </span><Link to="/reviewer-guide">Read the Reviewer Guide</Link><span aria-hidden="true"> · </span><Link to="/worked-example">See a Worked Example</Link></p>
  </aside>
}
