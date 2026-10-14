import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENTS_TIME_ZONE,
  buildEventsCalendarUrl,
  normaliseEventsTimeZone,
} from '../../src/lib/eventsCalendar.js'

describe('events calendar', () => {
  it('passes the visitor time zone to Google Calendar', () => {
    const url = new URL(buildEventsCalendarUrl('America/New_York'))

    expect(url.origin).toBe('https://calendar.google.com')
    expect(url.pathname).toBe('/calendar/embed')
    expect(url.searchParams.get('ctz')).toBe('America/New_York')
    expect(url.searchParams.get('src')).toContain('@group.calendar.google.com')
  })

  it('falls back to Pacific Time when the browser time zone is unavailable', () => {
    expect(normaliseEventsTimeZone()).toBe(DEFAULT_EVENTS_TIME_ZONE)
    expect(normaliseEventsTimeZone('not/a-time-zone')).toBe(DEFAULT_EVENTS_TIME_ZONE)
  })
})
