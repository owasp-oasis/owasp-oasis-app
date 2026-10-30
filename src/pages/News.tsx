import { Link } from 'react-router-dom'
import './News.css'

interface Article {
  slug: string
  category: string
  categoryClass: string
  date: string
  title: string
  excerpt: string
  href?: string
  actionLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
  deadline?: string
  featured?: boolean
}

interface Event {
  date: string
  day: string
  month: string
  dateLabel: string
  venue: string
  kind: string
  title: string
  time: string
  location: string
  details: string
  cancelled?: boolean
  href?: string
  secondaryHref?: string
  secondaryLabel?: string
}

const articles: Article[] = [
  {
    slug: 'sans-difference-makers-finalist',
    category: 'Award Finalist',
    categoryClass: 'badge-green',
    date: 'October 28, 2026',
    title: 'OWASP OASIS Named a 2026 SANS Difference Makers Awards Finalist',
    excerpt: 'SANS selected OWASP OASIS as one of five finalists for Innovation of the Year (Open-Source Product or Tool), recognizing its community-led workflow for turning automated patches into reviewed, upstream-ready security fixes.',
    href: 'https://go.sans.org/MBGfxJ',
    actionLabel: 'Vote for OASIS',
    secondaryHref: 'https://www.linkedin.com/posts/sans-difference-makers-awards-2026-community-ugcPost-7521314156336021504-DGzW/',
    secondaryLabel: 'View the SANS announcement',
    deadline: 'Community voting closes November 9, 2026.',
    featured: true,
  },
  {
    slug: 'launch',
    category: 'Press Release',
    categoryClass: 'badge-blue',
    date: 'August 26, 2026',
    title: 'OWASP OASIS Launches as Official OWASP Community Project',
    excerpt: 'The industry got very good at finding open source vulnerabilities. OWASP OASIS is the community fixing them. Founding members: AppSecAI, Intigriti, and DryRun Security.',
  },
]

const upcomingEvents: Event[] = [
  {
    date: '2026-11-20',
    day: '20–21',
    month: 'NOV',
    dateLabel: 'November 20–21, 2026',
    venue: 'NahamCon · NahamSec / Prompt2Pwn',
    kind: 'Speaking',
    title: 'Saving Open Source One Remediation at a Time',
    time: 'Time TBD',
    location: 'Oakland Marriott · Oakland, CA',
    details: 'Michael Cartsonis presents at NahamCon 2026 during Prompt2Pwn. The conference schedule will be updated here when the exact session time is announced.',
    href: 'https://labs.zenity.io/prompt2pwn',
  },
  {
    date: '2026-11-06',
    day: '6',
    month: 'NOV',
    dateLabel: 'November 6, 2026',
    venue: 'OWASP Global AppSec USA',
    kind: 'Book signing',
    title: 'Book Signing: Two Cycles, One Codebase',
    time: '3:00–3:30 PM PST · Friday, November 6',
    location: 'Grand Ballroom Foyer (Street Level) · Hyatt Regency San Francisco',
    details: 'Michael Cartsonis and Bruce Fram sign Two Cycles, One Codebase: How AI, Fix Automation, and OASIS Are Rewriting the Role of Application Security.',
    href: 'https://sched.co/2Ze2S',
    secondaryHref: 'https://www.amazon.com/dp/B0HHJ3JTVS',
    secondaryLabel: 'View the book',
  },
  {
    date: '2026-10-08',
    day: '8',
    month: 'OCT',
    dateLabel: 'October 8, 2026',
    venue: 'Online · Zoom Webinar',
    kind: 'Webinar',
    cancelled: true,
    title: 'The Future of AppSec, Open Source, and Your Role in the Age of AI',
    time: 'Cancelled · New date to be announced',
    location: 'Online · Zoom Webinar',
    details: 'This webinar has been cancelled and will be rescheduled. A new date will be announced soon.',
  },
]

const OASIS_CALENDAR_ID = 'c_a50ce340788bfe4e0498a6107f9cf9d26c31de6649747e8be7e902b1f5eda87d@group.calendar.google.com'

function getCalendarEmbedUrl() {
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  const params = new URLSearchParams({
    height: '600',
    wkst: '1',
    ctz: localTimeZone,
    showPrint: '0',
    src: OASIS_CALENDAR_ID,
    color: '#8e24aa',
  })
  return `https://calendar.google.com/calendar/embed?${params.toString()}`
}

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="news-arrow-icon">
    <path d="M5 12h14"/>
    <path d="m13 6 6 6-6 6"/>
  </svg>
)

export default function News() {
  return (
    <div className="news-index">
      <div className="page-hero">
        <div className="container">
          <h1>News &amp; Events</h1>
          <p className="page-hero-longform">Updates and appearances from the OWASP OASIS project and community</p>
        </div>
      </div>

      <section className="section news-events-section">
        <div className="container">
          <section className="events-calendar-panel" aria-labelledby="events-calendar-title">
            <div className="events-calendar-heading">
              <span className="badge badge-green">Shared calendar</span>
              <h2 id="events-calendar-title">OWASP OASIS Events Calendar</h2>
              <p>Browse OASIS trainings, community gatherings, and appearances. Calendar times follow your browser’s local time zone.</p>
            </div>
            <div className="events-calendar-frame">
              <iframe
                title="OWASP OASIS Events Calendar"
                src={getCalendarEmbedUrl()}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </section>

          <div className="news-section-heading">
            <span className="badge badge-green">Calendar</span>
            <h2>Events &amp; appearances</h2>
          </div>

          <div className="event-grid">
            {upcomingEvents.map(event => (
              <article key={`${event.date}-${event.title}`} className={`event-card${event.cancelled ? ' event-card--cancelled' : ''}`}>
                <div className="event-date" aria-label={event.dateLabel}>
                  <time dateTime={event.date}>
                    <span className="event-date-month">{event.month}</span>
                    <span className={`event-date-day${event.day.includes('–') ? ' event-date-day--range' : ''}`}>{event.day}</span>
                  </time>
                </div>
                <div className="event-card-content">
                  <div className="event-card-meta">
                    <span className="badge badge-green">{event.kind}</span>
                    {event.cancelled && <span className="badge badge-cancelled">Cancelled</span>}
                    <span>{event.venue}</span>
                  </div>
                  <h2 className="event-card-title">{event.title}</h2>
                  <p className="event-card-details">{event.details}</p>
                  <div className="event-card-facts">
                    <span><strong>When</strong>{event.time}</span>
                    <span><strong>Where</strong>{event.location}</span>
                  </div>
                  {(event.href || event.secondaryHref) && (
                    <div className="event-card-actions">
                      {event.href && (
                        <a href={event.href} target="_blank" rel="noopener noreferrer" className="news-card-read-more">
                          Event details <ArrowIcon />
                        </a>
                      )}
                      {event.secondaryHref && (
                        <a href={event.secondaryHref} target="_blank" rel="noopener noreferrer" className="news-card-source-link">
                          {event.secondaryLabel ?? 'View source'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="news-section-heading news-section-heading--latest">
            <div>
              <span className="badge badge-blue">From OASIS</span>
              <h2>Latest news</h2>
            </div>
          </div>

          <div className="news-grid">
            {articles.map(a => (
              <article key={a.slug} className={`news-card${a.featured ? ' news-card--featured' : ''}`}>
                <div className="news-card-content">
                  <div className="news-card-meta">
                    <span className={`badge ${a.categoryClass}`}>{a.category}</span>
                    <time className="news-card-date">{a.date}</time>
                  </div>
                  <h2 className="news-card-title">
                    {a.href ? (
                      <a href={a.href} target="_blank" rel="noopener noreferrer">{a.title}</a>
                    ) : (
                      <Link to={`/news/${a.slug}`}>{a.title}</Link>
                    )}
                  </h2>
                  <p className="news-card-excerpt">{a.excerpt}</p>
                  {a.deadline && <p className="news-card-deadline">{a.deadline}</p>}
                  <div className="news-card-actions">
                    {a.href ? (
                      <a href={a.href} target="_blank" rel="noopener noreferrer" className="news-card-read-more news-card-read-more--primary">
                        {a.actionLabel ?? 'Read more'} <ArrowIcon />
                      </a>
                    ) : (
                      <Link to={`/news/${a.slug}`} className="news-card-read-more">
                        {a.actionLabel ?? 'Read more'} <ArrowIcon />
                      </Link>
                    )}
                    {a.secondaryHref && (
                      <a href={a.secondaryHref} target="_blank" rel="noopener noreferrer" className="news-card-source-link">
                        {a.secondaryLabel ?? 'View source'}
                      </a>
                    )}
                  </div>
                </div>
                {a.featured && (
                  <div className="news-award-mark" aria-label="2026 SANS Difference Makers Awards, Innovation of the Year finalist">
                    <span>2026 SANS</span>
                    <strong>FINALIST</strong>
                    <small>Innovation of the Year</small>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
