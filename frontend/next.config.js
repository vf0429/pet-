/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080'
    return [
      {
        source: '/api/v1/merchant/:path*',
        destination: `${backendUrl}/v1/merchant/:path*`,
      },
      {
        source: '/api/app/v1/:path*',
        destination: `${backendUrl}/app/v1/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
