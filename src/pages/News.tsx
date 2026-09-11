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
  title: string
  time: string
  location: string
  details: string
  href: string
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
    date: '2026-09-16',
    day: '16',
    month: 'SEP',
    title: 'The OASIS Project: A Movement for Crowd-Sourced Fix Automation',
    time: '3:30–4:15 PM',
    location: 'Room 361 · General Session · Houston, TX',
    details: 'Daryl “Radar” Riley presents the OASIS model at CYBR.SEC.CON. 2026.',
    href: 'https://www.cybrseccon.com/attend',
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
                <div className="event-date" aria-label="September 16, 2026">
                  <time dateTime={event.date}>
                    <span className="event-date-month">{event.month}</span>
                    <span className="event-date-day">{event.day}</span>
                  </time>
                </div>
                <div className="event-card-content">
                  <div className="event-card-meta">
                    <span className="badge badge-green">Speaking</span>
                    <span>CYBR.SEC.CON. 2026</span>
                  </div>
                  <h2 className="event-card-title">{event.title}</h2>
                  <p className="event-card-details">{event.details}</p>
                  <div className="event-card-facts">
                    <span><strong>When</strong>{event.time} · Wed, September 16</span>
                    <span><strong>Where</strong>{event.location}</span>
                  </div>
                  <a href={event.href} target="_blank" rel="noopener noreferrer" className="news-card-read-more">
                    Conference details <ArrowIcon />
                  </a>
                </div>
              </article>
            ))}
          </div>

          <div className="news-section-heading news-section-heading--latest">
            <div>
              <span className="badge badge-blue">From OASIS</span>
              <h2>Latest news</h2>
            </div>
            <p>Project announcements and milestones from the OASIS team.</p>
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
