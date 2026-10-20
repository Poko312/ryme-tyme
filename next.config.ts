import type { NextConfig } from "next";

// Cache Components is intentionally off: almost every page reads the Supabase
// auth cookie, and the classic dynamic-rendering model is simpler to reason about.
const nextConfig: NextConfig = {
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
