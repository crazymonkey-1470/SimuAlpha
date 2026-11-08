import type { QuoteCard as Quote } from '../types';

/** A quote from the bank: words, attribution, why it matters and questions to get the crew talking. */
export default function QuoteCard({ q, compact = false }: { q: Quote; compact?: boolean }) {
  return (
    <figure className={`quote-card ${compact ? 'compact' : ''}`}>
      <blockquote>{q.text}</blockquote>
      <figcaption>
        <b>{q.author}</b>
        {q.source &&
          (q.source_url ? (
            <a href={q.source_url} target="_blank" rel="noopener noreferrer">
              <cite>{q.source}</cite>
            </a>
          ) : (
            <cite>{q.source}</cite>
          ))}
        {!q.verified && <span className="badge unverified">Attribution not verified</span>}
      </figcaption>
      {!compact && q.context && <p className="quote-context">{q.context}</p>}
      {!compact && q.questions.length > 0 && (
        <div className="quote-questions">
          <h4>Talk about it</h4>
          <ul className="points">
            {q.questions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
