import { useState, useEffect, useRef, useCallback } from 'react'
import './QuotesCarousel.css'

export interface Quote {
  name: string
  title: string
  company: string
  quote: string
  photoUrl: string | null
  linkedinUrl: string
}

interface Props {
  quotes: Quote[]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Avatar({ quote }: { quote: Quote }) {
  const [imgError, setImgError] = useState(false)

  if (!quote.photoUrl || imgError) {
    return (
      <div className="quote-avatar quote-avatar--initials" aria-hidden="true">
        {getInitials(quote.name)}
      </div>
    )
  }

  return (
    <img
      src={quote.photoUrl}
      alt={quote.name}
      className="quote-avatar quote-avatar--photo"
      width={52}
      height={52}
      onError={() => setImgError(true)}
    />
  )
}

function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <div className="quote-card">
      <blockquote className="quote-text">
        &ldquo;{quote.quote}&rdquo;
      </blockquote>
      <div className="quote-attribution">
        <Avatar quote={quote} />
        <div className="quote-person">
          <a
            className="quote-name"
            href={quote.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {quote.name}
          </a>
          <span className="quote-role">
            {quote.title} &middot; {quote.company}
          </span>
        </div>
      </div>
    </div>
  )
}

const AUTO_INTERVAL = 5000

export default function QuotesCarousel({ quotes }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const total = quotes.length

  // When there are 0 quotes, render nothing
  if (total === 0) return null

  const startInterval = useCallback(() => {
    if (total <= 1) return
    intervalRef.current = setInterval(() => {
      setActiveIndex(i => (i + 1) % total)
    }, AUTO_INTERVAL)
  }, [total])

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    startInterval()
    return () => stopInterval()
  }, [startInterval, stopInterval])

  function goTo(index: number) {
    setActiveIndex(((index % total) + total) % total)
  }

  function prev() { goTo(activeIndex - 1) }
  function next() { goTo(activeIndex + 1) }

  // Single-tile mode: <=2 quotes (wrapping would show same person twice)
  const singleTile = total <= 2

  const prevIndex = ((activeIndex - 1) + total) % total
  const nextIndex = (activeIndex + 1) % total

  return (
    <section className="home-quotes-section">
      <div className="wrap">
        <h2 className="home-quotes-title">What People Are Saying</h2>

        <div
          className={`quotes-carousel${singleTile ? ' quotes-carousel--single' : ''}`}
          onMouseEnter={stopInterval}
          onMouseLeave={startInterval}
        >
          {/* Left arrow */}
          {total > 1 && (
            <button
              className="carousel-arrow carousel-arrow--left"
              onClick={prev}
              aria-label="Previous quote"
            >
              &#8592;
            </button>
          )}

          {/* Track */}
          <div className="carousel-track">
            {singleTile ? (
              /* Single-tile display */
              <div className="carousel-tile carousel-tile--active">
                <QuoteCard quote={quotes[activeIndex]} />
              </div>
            ) : (
              /* 3-tile display */
              <>
                <div
                  className="carousel-tile carousel-tile--prev"
                  onClick={prev}
                  role="button"
                  tabIndex={0}
                  aria-label={`View quote from ${quotes[prevIndex].name}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') prev() }}
                >
                  <QuoteCard quote={quotes[prevIndex]} />
                </div>
                <div className="carousel-tile carousel-tile--active">
                  <QuoteCard quote={quotes[activeIndex]} />
                </div>
                <div
                  className="carousel-tile carousel-tile--next"
                  onClick={next}
                  role="button"
                  tabIndex={0}
                  aria-label={`View quote from ${quotes[nextIndex].name}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') next() }}
                >
                  <QuoteCard quote={quotes[nextIndex]} />
                </div>
              </>
            )}
          </div>

          {/* Right arrow */}
          {total > 1 && (
            <button
              className="carousel-arrow carousel-arrow--right"
              onClick={next}
              aria-label="Next quote"
            >
              &#8594;
            </button>
          )}
        </div>

        {/* Dot indicators */}
        {total > 1 && (
          <div className="carousel-dots" role="tablist" aria-label="Quote navigation">
            {quotes.map((q, i) => (
              <button
                key={q.name}
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Quote from ${q.name}`}
                className={`carousel-dot${i === activeIndex ? ' carousel-dot--active' : ''}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
