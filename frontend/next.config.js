/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/merchant/:path*',
        destination: 'http://localhost:8080/v1/merchant/:path*',
      },
      {
        source: '/api/app/v1/:path*',
        destination: 'http://localhost:8080/app/v1/:path*',
      },
    ]
  },
}

module.exports = nextConfig
