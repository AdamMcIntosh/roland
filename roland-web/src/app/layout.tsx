import type { Metadata } from 'next';
import './globals.css';
import { ApiKeyProvider } from '@/lib/ApiKeyContext';

export const metadata: Metadata = {
  title: 'Roland Web',
  description: 'Roland AI Orchestration — web interface',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApiKeyProvider>{children}</ApiKeyProvider>
      </body>
    </html>
  );
}
