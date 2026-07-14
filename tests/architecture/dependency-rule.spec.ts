import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Respaldo del linter (NFR-001 / NFR-002): si eslint-plugin-boundaries se desactivara o
// mal-configurara, este test sigue rompiendo la suite. No importa los fuentes (eso
// ejecutaría código y arrastraría `server-only`): los lee como texto y analiza sus imports.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "src");

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated") continue; // artefacto de Prisma, no es código de dominio
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

// Especificadores de import/export estáticos y dinámicos: `from "x"`, `import "x"`,
// `import("x")`. Suficiente para código fuente del proyecto (ESM, sin require).
const importsOf = (source: string): string[] => {
  const specs: string[] = [];
  const patterns = [
    /(?:import|export)[^;]*?from\s*["']([^"']+)["']/g,
    /import\s*["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      if (match[1]) specs.push(match[1]);
    }
  }
  return specs;
};

// Espejo de FRAMEWORK_INFRA_IN_DOMAIN en eslint.config.mjs.
const FORBIDDEN_IN_DOMAIN = [
  /^next$/,
  /^next\/.+/,
  /^@prisma\/.+/,
  /^prisma$/,
  /^prisma\/.+/,
  /^next-auth$/,
  /^next-auth\/.+/,
  /^@auth\/.+/,
];

// Deep-import entre módulos: solo `@/modules/<x>` (su index) es importable. Cualquier
// segmento adicional (`@/modules/<x>/domain/...`) salta la API pública.
const DEEP_MODULE_IMPORT = /^@\/modules\/[^/]+\/.+/;

// Espejo de AUTH_JS_CONFINEMENT en eslint.config.mjs (NFR-002 / SC-002): `next-auth`/`@auth`
// SOLO bajo `**/infrastructure/auth/**`. Respaldo del linter para el confinamiento de Auth.js.
const AUTH_JS_LIBS = [/^next-auth$/, /^next-auth\/.+/, /^@auth\/.+/];
const AUTH_INFRA_DIR = /modules\/[^/]+\/infrastructure\/auth\//;

// SC-013: `identity` NO conoce `tenancy` (dirección de dependencias §5 / ADR-003, NFR-004). El
// poblado del claim y la provisión de workspace se componen en app/, nunca dentro de identity.
// Cubre el import por barrel (`@/modules/tenancy`), que el guard de deep-import no atrapa.
const IDENTITY_DIR = /(^|\/)modules\/identity\//;
const TENANCY_MODULE = /^@\/modules\/tenancy(\/|$)/;

// SC-012: la política de autorización ES dominio y vive en `tenancy` (constitución §7.1). `config/`
// no puede importar la matriz de permisos (ni nada de `domain/authorization/`).
const CONFIG_DIR = /^src\/config\//;
const AUTHORIZATION_MODULE = /^@\/modules\/[^/]+\/domain\/authorization(\/|$)/;

const sourceFiles = walk(SRC).map((path) => ({
  path,
  rel: relative(ROOT, path).replace(/\\/g, "/"),
  imports: importsOf(readFileSync(path, "utf8")),
}));

describe("regla de dependencia (respaldo del linter)", () => {
  it("hay fuentes que analizar (guardia anti falso verde)", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("ningún archivo de domain/ importa framework ni infraestructura", () => {
    const violations = sourceFiles
      .filter((file) => /(^|\/)domain\//.test(file.rel))
      .flatMap((file) =>
        file.imports
          .filter((spec) => FORBIDDEN_IN_DOMAIN.some((re) => re.test(spec)))
          .map((spec) => `${file.rel} -> ${spec}`),
      );

    expect(violations).toEqual([]);
  });

  it("ningún archivo hace deep-import de otro módulo (solo su index)", () => {
    const violations = sourceFiles.flatMap((file) =>
      file.imports
        .filter((spec) => DEEP_MODULE_IMPORT.test(spec))
        .map((spec) => `${file.rel} -> ${spec}`),
    );

    expect(violations).toEqual([]);
  });

  it("Auth.js (next-auth/@auth) solo se importa bajo infrastructure/auth/ (NFR-002)", () => {
    const violations = sourceFiles
      .filter((file) => !AUTH_INFRA_DIR.test(file.rel))
      .flatMap((file) =>
        file.imports
          .filter((spec) => AUTH_JS_LIBS.some((re) => re.test(spec)))
          .map((spec) => `${file.rel} -> ${spec}`),
      );

    expect(violations).toEqual([]);
  });

  it("identity no importa tenancy (SC-013): la composición vive en app/", () => {
    const violations = sourceFiles
      .filter((file) => IDENTITY_DIR.test(file.rel))
      .flatMap((file) =>
        file.imports
          .filter((spec) => TENANCY_MODULE.test(spec))
          .map((spec) => `${file.rel} -> ${spec}`),
      );

    expect(violations).toEqual([]);
  });

  it("config/ no importa la matriz de permisos (SC-012): la autorización es dominio", () => {
    const violations = sourceFiles
      .filter((file) => CONFIG_DIR.test(file.rel))
      .flatMap((file) =>
        file.imports
          .filter((spec) => AUTHORIZATION_MODULE.test(spec))
          .map((spec) => `${file.rel} -> ${spec}`),
      );

    expect(violations).toEqual([]);
  });
});
