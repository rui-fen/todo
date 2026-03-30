import type { NextConfig } from "next"

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000"

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`,
      },
    ]
  },
}

export default nextConfig
