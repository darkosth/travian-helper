import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "100.75.47.35",
    "*.ts.net",
  ],
};

export default nextConfig;
