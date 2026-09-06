import type { NormalizedEvent } from '../lib/types';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function EventCard({ event }: { event: NormalizedEvent }) {
  return (
    <article className="event-card">
      <img src={event.imageUrl} alt={event.title} />
      <h2>{event.title}</h2>
      <p>{formatDate(event.date)}</p>
      <a href={event.url} target="_blank" rel="noopener noreferrer">
        Pegar ingresso
      </a>
    </article>
  );
}
