import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: { default: 'SiliconBox', template: '%s · SiliconBox' },
  description: 'Formal verification lessons, hands-on Drills and a built-in formal tool.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render per request so the CSP nonce from src/proxy.ts reaches every script (ADR 0017).
  await connection();
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
