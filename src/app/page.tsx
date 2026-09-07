import { EventTabs } from '../components/EventTabs';
import { createPool } from '../lib/db';
import { getEligibleEvents } from '../lib/eventsStore';
import type { NormalizedEvent } from '../lib/types';

// This page reads live event data from Postgres on every request, so it
// must never be statically prerendered at build time (`next build` runs
// with no database available, e.g. in CI/Vercel build containers).
export const dynamic = 'force-dynamic';

// Module-level singleton: Next.js keeps this module loaded across
// requests in the same server process, so one pool is reused instead
// of opening a new Postgres connection pool per page view.
const pool = createPool();

export default async function HomePage() {
  let events: NormalizedEvent[];
  try {
    events = await getEligibleEvents(pool);
  } catch (error) {
    // No error.tsx boundary exists for this MVP - degrade gracefully to
    // the grid's own empty state instead of a raw Next.js error page
    // (e.g. missing DATABASE_URL, cold-start timeout, connection limit).
    console.error('Failed to load eligible events', error);
    events = [];
  }

  return (
    <>
      <header className="site-header">
        <span className="site-header__logo">ticket-free</span>
        <span className="site-header__tagline">Rio de Janeiro</span>
      </header>
      <main>
        <h1>Ingressos grátis e até R$20 no Rio de Janeiro</h1>
        <EventTabs events={events} />
      </main>
    </>
  );
}
