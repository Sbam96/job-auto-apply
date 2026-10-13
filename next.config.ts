import type { NextConfig } from "next";

// Every page is signed-in and per-user, so pages render on request; no Cache Components.
const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "nodemailer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
