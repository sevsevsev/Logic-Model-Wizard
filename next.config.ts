import type { NextConfig } from "next";

// Fail fast at build/start time if the key is missing, rather than at
// runtime on the first user request.
if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    "Missing required environment variable: GEMINI_API_KEY\n" +
      "Copy .env.local.example to .env.local and add your key."
  );
}

const nextConfig: NextConfig = {
  // Explicitly prevent any env var from leaking to the browser bundle
  // unless it is prefixed with NEXT_PUBLIC_. GEMINI_API_KEY does not
  // have that prefix, so this is defense-in-depth.
  env: {},
};

export default nextConfig;
