// tests/component/EventGrid.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('renders image, name, date and a link to get the ticket for each event', () => {
    render(<EventGrid events={[makeEvent()]} />);

    const image = screen.getByRole('img', { name: 'Show Grátis no Aterro' });
    expect(image).toHaveAttribute('src', 'https://example.com/img.jpg');
    expect(screen.getByText('Show Grátis no Aterro')).toBeInTheDocument();
    expect(screen.getByText(/dezembro de 2026/)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /pegar ingresso/i });
    expect(link).toHaveAttribute('href', 'https://example.com/evento/1');
  });

  it('shows an empty-state message when there are no events', () => {
    render(<EventGrid events={[]} />);

    expect(
      screen.getByText(/nenhum evento grátis ou até r\$20/i),
    ).toBeInTheDocument();
  });
});
