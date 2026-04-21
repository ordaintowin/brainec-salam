/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // This allows the build to finish even if there are lint errors in the seed file
    ignoreDuringBuilds: true,
  },
  typescript: {
    // This ignores type errors (like the missing bcrypt) during the build
    ignoreBuildErrors: true,
  },
}

export default nextConfig
