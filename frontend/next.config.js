/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/merchant/:path*',
        destination: 'http://localhost:8080/merchant/:path*',
      },
    ]
  },
}

module.exports = nextConfig
