import type { NormalizedEvent } from '../lib/types';
import { EventCard } from './EventCard';

export function EventGrid({ events }: { events: NormalizedEvent[] }) {
  if (events.length === 0) {
    return <p>Nenhum evento grátis ou até R$20 encontrado no RJ agora.</p>;
  }

  return (
    <div className="event-grid">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
