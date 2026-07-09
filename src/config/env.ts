import "server-only";

import { parseEnv } from "./env.schema";

// Validated, typed environment. Import this from server code (`@/config/env`).
// `server-only` guarantees it can never be bundled into a Client Component.
export const env = parseEnv();

export type { Env } from "./env.schema";
