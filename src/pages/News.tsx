import { Link } from 'react-router-dom'
import './News.css'

interface Article {
  slug: string
  category: string
  categoryClass: string
  date: string
  title: string
  excerpt: string
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
  href?: string
}

const articles: Article[] = [
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
    date: '2026-09-25',
    day: '25–26',
    month: 'SEP',
    dateLabel: 'September 25–26, 2026',
    venue: 'B-Sides Orlando',
    kind: 'Speaking',
    title: 'The OASIS Project: A Movement for Crowd-Sourced Fix Automation',
    time: 'Talk time to be announced · Sep 25–26',
    location: 'Full Sail University · Winter Park, FL',
    details: 'Chris Holt presents the OASIS project at B-Sides Orlando.',
    href: 'https://bsidesorlando.org/',
  },
  {
    date: '2026-10-08',
    day: '1',
    month: 'OCT',
    dateLabel: 'October 8, 2026',
    venue: 'Online · Zoom Webinar',
    kind: 'Webinar',
    title: 'The Future of AppSec, Open Source, and Your Role in the Age of AI',
    time: '1:00 PM ET · 11:00 AM MT · Thu, October 8',
    location: 'Online · Zoom Webinar',
    details: 'Founding members AppSecAI, DryRun Security, and Intigriti discuss why they built OASIS together.',
  },
  {
    date: '2026-10-06',
    day: '6',
    month: 'OCT',
    dateLabel: 'October 6, 2026',
    venue: 'THREATCON1',
    kind: 'Speaking',
    title: 'The OASIS Project: A Movement for Crowd-Sourced Fix Automation',
    time: '1:10–1:40 PM · Tue, October 6',
    location: 'Sheraton Reston Hotel · Reston, VA',
    details: 'Chris Holt presents the OASIS project during the THREATCON1 technical track.',
    href: 'https://threatcon1.org',
  },
]

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
          <div className="news-section-heading">
            <span className="badge badge-green">Calendar</span>
            <h2>Upcoming events</h2>
          </div>

          <div className="event-grid">
            {upcomingEvents.map(event => (
              <article key={event.date} className="event-card">
                <div className="event-date" aria-label={event.dateLabel}>
                  <time dateTime={event.date}>
                    <span className="event-date-month">{event.month}</span>
                    <span className={`event-date-day${event.day.includes('–') ? ' event-date-day--range' : ''}`}>{event.day}</span>
                  </time>
                </div>
                <div className="event-card-content">
                  <div className="event-card-meta">
                    <span className="badge badge-green">{event.kind}</span>
                    <span>{event.venue}</span>
                  </div>
                  <h2 className="event-card-title">{event.title}</h2>
                  <p className="event-card-details">{event.details}</p>
                  <div className="event-card-facts">
                    <span><strong>When</strong>{event.time}</span>
                    <span><strong>Where</strong>{event.location}</span>
                  </div>
                  {event.href && (
                    <a href={event.href} target="_blank" rel="noopener noreferrer" className="news-card-read-more">
                      Event details <ArrowIcon />
                    </a>
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
              <article key={a.slug} className="news-card">
                <div className="news-card-meta">
                  <span className={`badge ${a.categoryClass}`}>{a.category}</span>
                  <time className="news-card-date">{a.date}</time>
                </div>
                <h2 className="news-card-title">
                  <Link to={`/news/${a.slug}`}>{a.title}</Link>
                </h2>
                <p className="news-card-excerpt">{a.excerpt}</p>
                <Link to={`/news/${a.slug}`} className="news-card-read-more">
                  Read more <ArrowIcon />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
