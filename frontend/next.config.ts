import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Load root-level .env so server-side API routes can access shared keys (GROQ_API_KEY, etc.)
const rootEnvPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(rootEnvPath)) {
  const lines = fs.readFileSync(rootEnvPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ['gray-matter'],
  transpilePackages: ['three'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
