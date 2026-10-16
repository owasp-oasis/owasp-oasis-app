import { describe, expect, it } from 'vitest'
import VoteForm, { ASSESSMENT_FIELDS, assessmentQuestionsForDecision, emptyAssessmentAnswers, type Decision } from '../../src/components/VoteForm'

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

  it('uses the concise Q3 display label without changing its stored value', () => {
    expect(ASSESSMENT_FIELDS.security_issue_addressed.options).toContainEqual(['needs_modification', 'Needs modification'])
  })

  it('never preselects an assessment conclusion', () => {
    expect(Object.values(emptyAssessmentAnswers)).toEqual(['', '', '', ''])
  })
})
