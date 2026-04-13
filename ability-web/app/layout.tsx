import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ability Capital Wallet',
  description: 'Web wallet for businesses and issuers on Ability',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
