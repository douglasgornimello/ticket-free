// tests/component/EventGrid.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EventGrid } from '../../src/components/EventGrid';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sympla:1',
    source: 'sympla',
    externalId: '1',
    title: 'Show Grátis no Aterro',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date('2026-12-01T20:00:00Z'),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com/evento/1',
    active: true,
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe('EventGrid', () => {
  afterEach(cleanup);

  it('renders image, name, date and a link to get the ticket for each event', () => {
    render(<EventGrid events={[makeEvent()]} />);

    const image = screen.getByRole('img', { name: 'Show Grátis no Aterro' });
    expect(image).toHaveAttribute('src', 'https://example.com/img.jpg');
    expect(screen.getByText('Show Grátis no Aterro')).toBeInTheDocument();
    // Event is stored as 2026-12-01T20:00:00Z (20:00 UTC). Rio de Janeiro
    // is UTC-3, so it must render as 17:00 local time, not 20:00.
    expect(screen.getByText(/dezembro de 2026.*17:00/)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /pegar ingresso/i });
    expect(link).toHaveAttribute('href', 'https://example.com/evento/1');
  });

  it('shows an empty-state message when there are no events', () => {
    render(<EventGrid events={[]} />);

    expect(
      screen.getByText(/nenhum evento grátis ou até r\$20/i),
    ).toBeInTheDocument();
  });

  it('badges a free event as "Grátis" and a paid event with its price', () => {
    render(
      <EventGrid
        events={[
          makeEvent({ id: 'sympla:1', isFree: true, minPrice: 0 }),
          makeEvent({ id: 'sympla:2', title: 'Peça Paga', isFree: false, minPrice: 15 }),
        ]}
      />,
    );

    expect(screen.getByText('Grátis')).toBeInTheDocument();
    expect(screen.getByText('R$ 15')).toBeInTheDocument();
  });
});
