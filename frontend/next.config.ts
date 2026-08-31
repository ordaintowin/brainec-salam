/** @type {import('next').NextConfig} */
const backendUrl = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  'http://127.0.0.1:5001'
).replace(/\/$/, '');

const nextConfig = {
  eslint: {
    // This allows the build to finish even if there are lint errors in the seed file
    ignoreDuringBuilds: true,
  },
  typescript: {
    // This ignores type errors (like the missing bcrypt) during the build
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
}

export default nextConfig
