import Providers from '@/components/Providers';
import './globals.css';

export const metadata = {
  title: 'OnePWS CardScan - Business Card Scanner',
  description: 'Professional AI-powered business card scanner. Scan, extract, and manage contacts instantly.',
  icons: { icon: '/assets/logo-icon.png', apple: '/assets/logo-icon.png' },
  manifest: '/manifest.json',
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
