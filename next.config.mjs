/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the development status indicator away from the mobile bottom dock.
  // The default bottom-left placement physically intercepts the Contacts tap.
  devIndicators: {
    position: 'top-right',
  },

  // Canonical domain: force www -> apex so scanner.onepws.com is the single
  // origin (keeps NextAuth cookies + camera permission on one host). Vercel
  // already upgrades http -> https at the edge, so this only handles the host.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.scanner.onepws.com' }],
        destination: 'https://scanner.onepws.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
