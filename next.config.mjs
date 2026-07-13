/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the development status indicator away from the mobile bottom dock.
  // The default bottom-left placement physically intercepts the Contacts tap.
  devIndicators: {
    position: 'top-right',
  },
};

export default nextConfig;
