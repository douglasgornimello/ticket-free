'use client';

import { useMemo, useState } from 'react';
import type { NormalizedEvent } from '../lib/types';
import { EventGrid } from './EventGrid';

type TabId = 'all' | 'free' | 'paid';
type SourceId = 'all' | string;

// Nome amigável exibido no seletor de fonte.
const SOURCE_LABELS: Record<string, string> = {
  sympla: 'Sympla',
  eventbrite: 'Eventbrite',
  ingresse: 'Ingresse',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function EventTabs({ events }: { events: NormalizedEvent[] }) {
  const [active, setActive] = useState<TabId>('all');
  // 'all' = todos os sites; senão, um source específico.
  const [sourceFilter, setSourceFilter] = useState<SourceId>('all');

  // Fontes presentes nos eventos atuais (para montar o seletor).
  const sources = useMemo(() => {
    const order = ['sympla', 'eventbrite', 'ingresse'];
    const seen = new Set(events.map((e) => e.source));
    return order.filter((s) => seen.has(s)).concat([...seen].filter((s) => !order.includes(s)));
  }, [events]);

  // Aplica o filtro de fonte PRIMEIRO, depois o de preço.
  const sourceEvents = useMemo(
    () => (sourceFilter === 'all' ? events : events.filter((e) => e.source === sourceFilter)),
    [events, sourceFilter],
  );

  const freeEvents = sourceEvents.filter((event) => event.isFree);
  const paidEvents = sourceEvents.filter((event) => !event.isFree);

  const tabs: Array<{ id: TabId; label: string; count: number; events: NormalizedEvent[] }> = [
    { id: 'all', label: 'Todos', count: sourceEvents.length, events: sourceEvents },
    { id: 'free', label: 'Grátis', count: freeEvents.length, events: freeEvents },
    { id: 'paid', label: 'Até R$20', count: paidEvents.length, events: paidEvents },
  ];

  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div>
      {/* Filtro por site (origem do ingresso) */}
      <div className="event-source-tabs" role="tablist" aria-label="Filtrar por site">
        <button
          type="button"
          role="tab"
          aria-selected={sourceFilter === 'all'}
          className={sourceFilter === 'all' ? 'event-source-tab event-tab--active' : 'event-source-tab'}
          onClick={() => setSourceFilter('all')}
        >
          Todos os sites
        </button>
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={sourceFilter === s}
            className={sourceFilter === s ? 'event-source-tab event-tab--active' : 'event-source-tab'}
            onClick={() => setSourceFilter(s)}
          >
            {sourceLabel(s)}
          </button>
        ))}
      </div>

      {/* Filtro por preço */}
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