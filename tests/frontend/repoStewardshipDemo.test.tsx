// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import RepoStewardshipAbout from '../../src/components/ProjectPanel/RepoStewardshipAbout'

afterEach(cleanup)

function renderDemo() {
  return render(<MemoryRouter><RepoStewardshipAbout repoId={1001} repoName="owasp-testing-guide" repoFullName="owasp-oasis/owasp-testing-guide" demo /></MemoryRouter>)
}

describe('repository stewardship demo', () => {
  it('lets the sample Steward add, edit, and remove a Repo Role without saving it', async () => {
    const user = userEvent.setup()
    renderDemo()

    expect(screen.getByText('Alex Security')).toBeTruthy()
    expect(screen.getByText('Security Reviewer')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add Repo Role' }))
    await user.type(screen.getByLabelText('GitHub username'), 'casey-demo')
    await user.type(screen.getByLabelText('Repo Role'), 'Dependency Mapper')
    await user.type(screen.getByLabelText('Role description'), 'Maps the risky dependency paths.')
    await user.click(screen.getByRole('button', { name: 'Assign Repo Role' }))

    const role = await screen.findByText('Dependency Mapper')
    expect(role).toBeTruthy()
    const row = role.closest('.pp-role-assignment')!
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    const roleInput = screen.getByLabelText('Repo Role')
    await user.clear(roleInput)
    await user.type(roleInput, 'Dependency Reviewer')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Dependency Reviewer')).toBeTruthy()

    const editedRow = screen.getByText('Dependency Reviewer').closest('.pp-role-assignment')!
    await user.click(within(editedRow).getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByText('Dependency Reviewer')).toBeNull())
    expect(screen.getByRole('status').textContent).toContain('Demo only; no changes were saved.')
  })

  it('walks a request through review and appoints the applicant in demo state', async () => {
    const user = userEvent.setup()
    renderDemo()
    await user.click(screen.getByRole('button', { name: 'Requestor' }))
    await user.click(screen.getByRole('button', { name: 'Request Stewardship' }))
    expect(await screen.findByText(/waiting for OASIS Team review/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'OASIS reviewer' }))
    expect(screen.getByText('Jordan OSS')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Appoint Security Steward' }))
    await waitFor(() => expect(screen.getByText('Jordan OSS')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Add Repo Role' })).toBeTruthy()
    expect(screen.getByText(/Demo only; no changes were saved/)).toBeTruthy()
  })
})
