import type { NormalizedEvent } from '../lib/types';

function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

const SOURCE_LABELS: Record<string, string> = {
  sympla: 'Sympla',
  eventbrite: 'Eventbrite',
  ingresse: 'Ingresse',
};

export function EventCard({ event }: { event: NormalizedEvent }) {
  const sourceLabel = SOURCE_LABELS[event.source] ?? event.source;

  return (
    <article className="event-card">
      <div className="event-card__media">
        <img src={event.imageUrl} alt={event.title} />
        <span className={event.isFree ? 'price-badge price-badge--free' : 'price-badge price-badge--paid'}>
          {event.isFree ? 'Grátis' : `R$ ${event.minPrice}`}
        </span>
      </div>
      <div className="event-card__body">
        <span className="event-source-badge">{sourceLabel}</span>
        <h2>{event.title}</h2>
        <p>{formatDate(event.date)}</p>
        <a href={event.url} target="_blank" rel="noopener noreferrer">
          Pegar ingresso
        </a>
      </div>
    </article>
  );
}