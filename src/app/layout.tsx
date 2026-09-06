import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'ticket-free RJ',
  description: 'Eventos grátis e até R$20 no estado do Rio de Janeiro',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
