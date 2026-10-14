export const DEFAULT_EVENTS_TIME_ZONE = 'America/Los_Angeles'

const EVENTS_CALENDAR_ID = 'c_a50ce340788bfe4e0498a6107f9cf9d26c31de6649747e8be7e902b1f5eda87d@group.calendar.google.com'

export function normaliseEventsTimeZone(candidate?: string | null): string {
  if (!candidate) return DEFAULT_EVENTS_TIME_ZONE

  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone
  } catch {
    return DEFAULT_EVENTS_TIME_ZONE
  }
}

export function getBrowserEventsTimeZone(): string {
  try {
    return normaliseEventsTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return DEFAULT_EVENTS_TIME_ZONE
  }
}

export function buildEventsCalendarUrl(timeZone: string): string {
  const url = new URL('https://calendar.google.com/calendar/embed')
  url.searchParams.set('height', '600')
  url.searchParams.set('wkst', '1')
  url.searchParams.set('ctz', normaliseEventsTimeZone(timeZone))
  url.searchParams.set('showPrint', '0')
  url.searchParams.set('src', EVENTS_CALENDAR_ID)
  url.searchParams.set('color', '#8e24aa')
  return url.toString()
}
