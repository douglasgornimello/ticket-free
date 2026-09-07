'use client';

import { useState } from 'react';
import type { NormalizedEvent } from '../lib/types';
import { EventGrid } from './EventGrid';

type TabId = 'all' | 'free' | 'paid';

export function EventTabs({ events }: { events: NormalizedEvent[] }) {
  const [active, setActive] = useState<TabId>('all');

  const freeEvents = events.filter((event) => event.isFree);
  const paidEvents = events.filter((event) => !event.isFree);

  const tabs: Array<{ id: TabId; label: string; count: number; events: NormalizedEvent[] }> = [
    { id: 'all', label: 'Todos', count: events.length, events },
    { id: 'free', label: 'Grátis', count: freeEvents.length, events: freeEvents },
    { id: 'paid', label: 'Até R$20', count: paidEvents.length, events: paidEvents },
  ];

  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div>
      <div className="event-tabs" role="tablist" aria-label="Filtrar por preço">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            className={tab.id === active ? 'event-tab event-tab--active' : 'event-tab'}
            onClick={() => setActive(tab.id)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      <EventGrid events={activeTab.events} />
    </div>
  );
}
