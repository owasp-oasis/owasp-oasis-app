import { expect, test, type Page } from '@playwright/test'

const fixUrl = '/workspace/fixes/react/72?repo=1268816985&layout=split&all=1&tab=comments'

async function expectFooterInFrame(page: Page) {
  await expect.poll(() => page.locator('.prp-panel').evaluate(panel => {
    const frame = panel.getBoundingClientRect()
    const footer = panel.querySelector('.prp-vote-footer')!.getBoundingClientRect()
    return Math.max(frame.bottom - window.innerHeight, footer.bottom - frame.bottom)
  })).toBeLessThanOrEqual(0)
}

async function dismissFirstAccessGuide(page: Page) {
  const continueButton = page.getByRole('button', { name: 'Continue' })
  if (await continueButton.isVisible()) await continueButton.click()
}

test('keeps the vote bar visible while long comments scroll in Split layout', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 729 })
  await page.goto(fixUrl)
  await expect(page.locator('.prp-vote-bar')).toBeVisible()
  await dismissFirstAccessGuide(page)
  await expectFooterInFrame(page)

  const content = page.locator('.prp-panel-content')
  const before = await content.evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }))
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight)
  await content.evaluate(element => { element.scrollTop = 300 })
  await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expectFooterInFrame(page)

  await page.locator('.ws-preferences-toggle button').click()
  await expectFooterInFrame(page)
  await page.setViewportSize({ width: 900, height: 729 })
  await expectFooterInFrame(page)
})

test('keeps the vote form inside a short Focus panel', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 729 })
  await page.goto(fixUrl.replace('layout=split', 'layout=focus'))
  await expect(page.locator('.prp-vote-bar')).toBeVisible()
  await dismissFirstAccessGuide(page)
  await page.locator('.prp-vote-btn--accept').click()
  await expect(page.getByRole('button', { name: 'Submit vote' })).toBeVisible()
  await expectFooterInFrame(page)
})

test('keeps mobile choices reachable inside the footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(fixUrl)
  const bar = page.locator('.prp-vote-bar')
  await expect(bar).toBeVisible()
  await dismissFirstAccessGuide(page)
  await expectFooterInFrame(page)

  const duplicate = bar.locator('.prp-vote-btn--duplicate')
  await duplicate.scrollIntoViewIfNeeded()
  const positions = await bar.evaluate(element => ({
    barRight: element.getBoundingClientRect().right,
    buttonRight: element.querySelector('.prp-vote-btn--duplicate')!.getBoundingClientRect().right,
  }))
  expect(positions.buttonRight).toBeLessThanOrEqual(positions.barRight)
})
