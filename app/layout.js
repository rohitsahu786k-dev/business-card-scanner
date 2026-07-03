import Providers from '@/components/Providers';
import './globals.css';

export const metadata = {
  metadataBase: new URL('https://scanner.onepws.com'),
  title: 'OnePWS CardScan - Business Card Scanner',
  description: 'Professional AI-powered business card scanner. Scan, extract, and manage contacts instantly.',
  icons: { icon: '/assets/logo-icon.png', apple: '/assets/logo-icon.png' },
  manifest: '/manifest.json',
  openGraph: {
    title: 'OnePWS CardScan - Business Card Scanner',
    description: 'Professional AI-powered business card scanner. Scan, extract, and manage contacts instantly.',
    url: 'https://scanner.onepws.com',
    siteName: 'OnePWS CardScan',
    images: [
      {
        url: '/assets/og-image.png',
        width: 1200,
        height: 630,
        alt: 'OnePWS CardScan Open Graph Featured Image',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OnePWS CardScan - Business Card Scanner',
    description: 'Professional AI-powered business card scanner. Scan, extract, and manage contacts instantly.',
    images: ['/assets/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    title: 'OnePWS CardScan',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
