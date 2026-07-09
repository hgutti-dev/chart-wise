import type { NextConfig } from "next";

import { parseEnv } from "./src/config/env.schema";

// Fail-fast: validate environment variables when the config loads. If a required
// one is missing, `next build`/`next dev` die here — not in production at 3 a.m.
parseEnv();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
