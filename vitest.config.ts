import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Un único alias `@` -> src/ cubre @/*, @/modules/*, @/shared/* y @/config/* porque
// todos resuelven dentro de src con el mismo sufijo. Solo matchea `@` o `@/…`, así que
// no colisiona con paquetes con scope (@base-ui/*, @prisma/*, @auth/*).
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Dos proyectos separados (FR-007): el de dominio corre sin DB ni red (NFR-005); el de
// integración carga `.env` y habla con Postgres para probar el aislamiento por RLS (SC-006).
export default defineConfig({
  resolve: {
    alias: { "@": srcDir },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "tests/unit/**/*.spec.ts",
            "tests/architecture/**/*.spec.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: [
            "tests/integration/**/*.spec.ts",
            "tests/isolation/**/*.spec.ts",
          ],
          setupFiles: ["tests/integration/load-env.ts"],
        },
      },
    ],
  },
});
