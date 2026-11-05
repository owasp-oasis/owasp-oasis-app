import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import VoteForm, { ASSESSMENT_FIELDS, assessmentPayloadForDecision, assessmentQuestionsForDecision, emptyAssessmentAnswers, type Decision } from '../../src/components/VoteForm'
import { AuthProvider } from '../../src/context/AuthContext'
import { WorkspaceProvider } from '../../src/context/WorkspaceContext'

function renderVoteForm(decision: Decision) {
  return renderToStaticMarkup(createElement(AuthProvider, null,
    createElement(WorkspaceProvider, null,
      createElement(VoteForm, {
        pr: { id: 1, repo_name: 'test-repo', number: 1, title: 'Test PR' },
        initialDecision: decision,
        onClose: () => {},
        onSuccess: () => {},
      }),
    ),
  ))
}

describe('validation assessment UX', () => {
  it('keeps Hardening as an optional vulnerability classification, not a final decision', () => {
    const finalDecisions: Decision[] = ['accept', 'modify', 'reject', 'duplicate']
    expect(finalDecisions).not.toContain('hardening')
    expect(ASSESSMENT_FIELDS.vulnerability_assessment.options).toContainEqual(['hardening', 'Hardening'])
    expect(ASSESSMENT_FIELDS.vulnerability_assessment.help).toContain('does not demonstrate a vulnerability')
    expect(VoteForm).toBeDefined()
  })

  it('shows all assessment questions for Accept, Modify, and Reject, but not Duplicate', () => {
    const questions = ['vulnerability_assessment', 'introduced_vulnerability', 'security_issue_addressed', 'breaks_codebase']
    expect(assessmentQuestionsForDecision('accept')).toEqual(questions)
    expect(assessmentQuestionsForDecision('modify')).toEqual(questions)
    expect(assessmentQuestionsForDecision('reject')).toEqual(questions)
    expect(assessmentQuestionsForDecision('duplicate')).toEqual([])
  })

  it.each(['accept', 'modify', 'reject'] as const)('renders the assessment controls for %s', decision => {
    const html = renderVoteForm(decision)
    expect(html).toContain('Assessment')
    for (const question of Object.values(ASSESSMENT_FIELDS)) {
      expect(html).toContain(question.label)
    }
    expect((html.match(/>Not answered<\/option>/g) ?? [])).toHaveLength(4)
  })

  it('does not render assessment controls for Duplicate', () => {
    const html = renderVoteForm('duplicate')
    expect(html).not.toContain('Assessment')
    expect(html).not.toContain('Is this a vulnerability?')
  })

  it('uses the concise Q3 display label without changing its stored value', () => {
    expect(ASSESSMENT_FIELDS.security_issue_addressed.options).toContainEqual(['needs_modification', 'Needs modification'])
  })

  it('never preselects an assessment conclusion', () => {
    expect(Object.values(emptyAssessmentAnswers)).toEqual(['', '', '', ''])
  })

  it('keeps the four answers independent of Accept, Modify, or Reject and maps unanswered fields to NULL', () => {
    const answers = {
      vulnerability_assessment: 'hardening',
      introduced_vulnerability: '',
      security_issue_addressed: 'no',
      breaks_codebase: '',
    }
    const payload = {
      vulnerability_assessment: 'hardening',
      introduced_vulnerability: null,
      security_issue_addressed: 'no',
      breaks_codebase: null,
    }

    for (const decision of ['accept', 'modify', 'reject'] as const) {
      expect(assessmentPayloadForDecision(decision, answers)).toEqual(payload)
    }
    expect(assessmentPayloadForDecision('duplicate', answers)).toBeNull()
  })
})
