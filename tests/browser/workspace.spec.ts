import { expect, test } from '@playwright/test'

test.describe('Workspace v3 browser workflows', () => {
  test('queue deep link selects and scrolls the requested candidate', async ({ page }) => {
    await page.goto('/workspace/fixes/react/14?layout=split&all=1')

    const selected = page.locator('.ws-fix-row[data-pr-id="3861709678"]')
    await expect(selected).toBeVisible()
    await expect(selected).toHaveClass(/is-selected/)
    await expect(page.getByRole('heading', { name: /Path Traversal/i })).toBeVisible()

    const visibility = await selected.evaluate((element) => {
      const row = element.getBoundingClientRect()
      const list = element.closest('.ws-fix-list')?.getBoundingClientRect()
      return list ? { rowTop: row.top, rowBottom: row.bottom, listTop: list.top, listBottom: list.bottom } : null
    })
    expect(visibility).not.toBeNull()
    expect(visibility!.rowTop).toBeGreaterThanOrEqual(visibility!.listTop)
    expect(visibility!.rowBottom).toBeLessThanOrEqual(visibility!.listBottom)
  })

  test('keeps the selected candidate across table and focus layouts', async ({ page }) => {
    await page.goto('/workspace/fixes/react/14?layout=table&all=1')
    await expect(page.locator('.ws-fix-table tr[data-pr-id="3861709678"]')).toHaveClass(/is-selected/)
    await expect(page.locator('.prp-panel')).toBeVisible()

    await page.goto('/workspace/fixes/react/14?layout=focus&all=1')
    await expect(page.locator('.ws-focus')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Path Traversal/i })).toBeVisible()
  })

  test('loads comments and exposes the review actions', async ({ page }) => {
    await page.goto('/workspace/fixes/express/3?layout=split&all=1&tab=comments')
    await expect(page.getByRole('tab', { name: /Comments/i })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.prp-comment, .prp-no-data').first()).toBeVisible()

    const actions = page.getByRole('button', { name: /^(Accept|Modify|Reject|Duplicate)$/ })
    await expect(actions).toHaveCount(4)
    await page.locator('.prp-vote-bar').getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Submit vote' })).toBeVisible()
  })

  test('preferences remain reachable and teams expose the member workflow', async ({ page }) => {
    await page.goto('/workspace/preferences')
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watched repositories' })).toBeVisible()

    await page.goto('/workspace/teams')
    await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible()
    await expect(page.getByText('Python security reviewers', { exact: true })).toBeVisible()
  })

  test('mobile review actions have separate hit targets and remain visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/workspace/fixes/react/14?layout=split&all=1')
    const voteBar = page.locator('.prp-vote-bar')
    await expect(voteBar.getByRole('button', { name: 'Accept', exact: true })).toBeVisible()

    const boxes = await Promise.all(['Accept', 'Modify', 'Reject', 'Duplicate'].map(async (label) => {
      const box = await voteBar.getByRole('button', { name: label, exact: true }).boundingBox()
      expect(box).not.toBeNull()
      return { label, ...box! }
    }))
    for (const left of boxes) {
      for (const right of boxes) {
        if (left.label >= right.label) continue
        const overlaps = left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
        expect(overlaps, `${left.label} overlaps ${right.label}`).toBe(false)
      }
    }
  })

  test('keeps the validation footer inside the viewport on desktop Safari-sized layouts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/workspace/fixes/react/14?layout=split&all=1')

    const footer = page.locator('.prp-vote-footer')
    await expect(page.locator('.prp-vote-bar').getByRole('button', { name: 'Accept', exact: true })).toBeVisible()
    const box = await footer.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(900)
  })
})
