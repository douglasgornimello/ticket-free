import { EventGrid } from '../components/EventGrid';
import { createPool } from '../lib/db';
import { getEligibleEvents } from '../lib/eventsStore';

// Module-level singleton: Next.js keeps this module loaded across
// requests in the same server process, so one pool is reused instead
// of opening a new Postgres connection pool per page view.
const pool = createPool();

export default async function HomePage() {
  const events = await getEligibleEvents(pool);

  return (
    <main>
      <h1>Ingressos grátis e até R$20 no Rio de Janeiro</h1>
      <EventGrid events={events} />
    </main>
  );
}
