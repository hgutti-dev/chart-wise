import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Deterministic guards (no import resolver needed): they enforce the phase's
// Success Criteria on the import specifier string itself.
const FRAMEWORK_INFRA_IN_DOMAIN = [
  { group: ["next", "next/*"], message: "domain/ no debe importar Next.js." },
  {
    group: ["@prisma/client", "@prisma/*", "prisma", "prisma/*"],
    message: "domain/ no debe importar Prisma.",
  },
  {
    group: ["next-auth", "next-auth/*", "@auth/*"],
    message: "domain/ no debe importar Auth.js.",
  },
];

const DEEP_MODULE_IMPORT = {
  group: ["@/modules/*/*", "@/modules/*/*/**"],
  message:
    "Importa un módulo solo por su API pública: @/modules/<módulo> (su index.ts). Los deep-imports entre módulos están prohibidos.",
};

// Allowed dependency direction per element type (Clean Architecture): domain
// points to nobody but the shared kernel + config; outer layers point inward.
const LAYER_POLICIES = [
  ["domain", ["domain", "shared-domain", "config"]],
  [
    "application",
    ["application", "domain", "shared", "shared-domain", "config", "module"],
  ],
  [
    "infrastructure",
    ["infrastructure", "application", "domain", "shared", "shared-domain", "config"],
  ],
  [
    "presentation",
    [
      "presentation",
      "application",
      "domain",
      "shared",
      "shared-domain",
      "config",
      "components",
      "lib",
    ],
  ],
  [
    "module",
    [
      "module",
      "domain",
      "application",
      "infrastructure",
      "presentation",
      "shared",
      "shared-domain",
      "config",
    ],
  ],
  ["shared", ["shared", "shared-domain", "config"]],
  ["shared-domain", ["shared-domain", "config"]],
  ["config", ["config"]],
  ["app", ["app", "module", "shared", "shared-domain", "config", "components", "lib"]],
  ["components", ["components", "lib", "shared", "shared-domain", "config"]],
  ["lib", ["lib"]],
].map(([from, to]) => ({
  from: { element: { type: from } },
  allow: { to: { element: { type: to } } },
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Architecture-aware layer: bounded contexts (modules) + Clean Architecture layers.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "config", pattern: "src/config" },
        { type: "shared-domain", pattern: "src/shared/domain" },
        { type: "shared", pattern: "src/shared" },
        { type: "components", pattern: "src/components" },
        { type: "lib", pattern: "src/lib" },
        { type: "app", pattern: "src/app" },
        { type: "domain", pattern: "src/modules/*/domain", capture: ["module"] },
        { type: "application", pattern: "src/modules/*/application", capture: ["module"] },
        {
          type: "infrastructure",
          pattern: "src/modules/*/infrastructure",
          capture: ["module"],
        },
        {
          type: "presentation",
          pattern: "src/modules/*/presentation",
          capture: ["module"],
        },
        { type: "module", pattern: "src/modules/*", capture: ["module"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        { default: "disallow", policies: LAYER_POLICIES },
      ],
    },
  },

  // Deterministic guard: no deep-imports across modules (only the public index).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [DEEP_MODULE_IMPORT] }],
    },
  },

  // Deterministic guard: domain purity (no framework/infra inside any domain/).
  {
    files: ["src/**/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [DEEP_MODULE_IMPORT, ...FRAMEWORK_INFRA_IN_DOMAIN] },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
