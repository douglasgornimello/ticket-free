import { EventGrid } from '../components/EventGrid';
import { createPool } from '../lib/db';
import { getEligibleEvents } from '../lib/eventsStore';

// This page reads live event data from Postgres on every request, so it
// must never be statically prerendered at build time (`next build` runs
// with no database available, e.g. in CI/Vercel build containers).
export const dynamic = 'force-dynamic';

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
