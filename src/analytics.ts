let csrf: { token: string; expiresAt: number } | null = null
let csrfRequest: Promise<string | null> | null = null

async function analyticsCsrf(): Promise<string | null> {
  if (csrf && csrf.expiresAt > Date.now()) return csrf.token
  if (!csrfRequest) {
    csrfRequest = fetch('/api/csrf', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return null
        const data = await response.json() as { token?: string }
        if (!data.token) return null
        csrf = { token: data.token, expiresAt: Date.now() + 50 * 60_000 }
        return data.token
      })
      .catch(() => null)
      .finally(() => { csrfRequest = null })
  }
  return csrfRequest
}

async function postTelemetry(endpoint: string, body: Record<string, unknown>): Promise<void> {
  const token = await analyticsCsrf()
  if (!token) return
  await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    keepalive: true,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': token,
    },
    body: JSON.stringify({ event_id: crypto.randomUUID(), ...body }),
  }).catch(() => undefined)
}

export function trackPageView(path: string, includeNavigationTiming: boolean): void {
  let loadMs: number | null = null
  let responseStatus: number | null = null
  if (includeNavigationTiming) {
    const navigation = performance.getEntriesByType('navigation')[0] as
      | (PerformanceNavigationTiming & { responseStatus?: number })
      | undefined
    if (navigation && Number.isFinite(navigation.duration)) loadMs = Math.round(navigation.duration)
    if (navigation?.responseStatus && Number.isInteger(navigation.responseStatus)) {
      responseStatus = navigation.responseStatus
    }
  }
  void postTelemetry('/api/analytics/pageview', {
    path,
    load_ms: loadMs,
    response_status: responseStatus,
  })
}

export function trackReviewEngagement(
  prId: number,
  type: 'review_opened' | 'review_heartbeat' | 'review_closed',
  activeSeconds = 0,
): void {
  void postTelemetry('/api/analytics/engagement', {
    pr_id: prId,
    type,
    active_seconds: activeSeconds,
  })
}
