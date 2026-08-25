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
          <h1>News &amp; Announcements</h1>
          <p className="page-hero-longform">Updates from the OWASP OASIS project and community</p>
        </div>
      </div>

      <section className="section">
        <div className="container">
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
