// tests/component/EventTabs.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EventTabs } from '../../src/components/EventTabs';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sympla:1',
    source: 'sympla',
    externalId: '1',
    title: 'Evento Teste',
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

const freeEvent = makeEvent({ id: 'sympla:1', title: 'Show Grátis', isFree: true, minPrice: 0 });
const paidEvent = makeEvent({
  id: 'sympla:2',
  title: 'Peça Paga',
  isFree: false,
  minPrice: 15,
});

describe('EventTabs', () => {
  afterEach(cleanup);

  it('shows all events under "Todos" by default, with correct counts on each tab', () => {
    render(<EventTabs events={[freeEvent, paidEvent]} />);

    expect(screen.getByText('Show Grátis')).toBeInTheDocument();
    expect(screen.getByText('Peça Paga')).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: /todos \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /grátis \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /até r\$20 \(1\)/i })).toBeInTheDocument();
  });

  it('filters to only free events when the "Grátis" tab is clicked', () => {
    render(<EventTabs events={[freeEvent, paidEvent]} />);

    fireEvent.click(screen.getByRole('tab', { name: /grátis \(1\)/i }));

    expect(screen.getByText('Show Grátis')).toBeInTheDocument();
    expect(screen.queryByText('Peça Paga')).not.toBeInTheDocument();
  });

  it('filters to only paid events when the "Até R$20" tab is clicked', () => {
    render(<EventTabs events={[freeEvent, paidEvent]} />);

    fireEvent.click(screen.getByRole('tab', { name: /até r\$20 \(1\)/i }));

    expect(screen.getByText('Peça Paga')).toBeInTheDocument();
    expect(screen.queryByText('Show Grátis')).not.toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(<EventTabs events={[freeEvent, paidEvent]} />);

    const allTab = screen.getByRole('tab', { name: /todos \(2\)/i });
    const freeTab = screen.getByRole('tab', { name: /grátis \(1\)/i });
    expect(allTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(freeTab);
    expect(freeTab).toHaveAttribute('aria-selected', 'true');
    expect(allTab).toHaveAttribute('aria-selected', 'false');
  });
});
