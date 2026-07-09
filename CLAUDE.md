# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: spec-first, pre-implementation

`chart-wise` is a planned multi-tenant SaaS: a user, inside an **organization (tenant)**, uploads datasets, sends them to an **external FastAPI analysis microservice**, and views the results as **dashboards and insights**.

The critical thing to understand: **the source of truth is `docs/`, not `src/`.** Right now `src/` is a near-empty `create-next-app` scaffold (a hello-world page, one shadcn `Button`, `cn()`). The full architecture is already **specified and normative** in the documents. Do not infer architecture from the current code — read the spec.

- [docs/spec.md](docs/spec.md) — the **constitution**: Clean Architecture (Hexagonal / Ports & Adapters) + DDD + real multitenancy. Its principles are **requirements, not suggestions**, and are meant to be enforced by tooling and tests.
- [docs/specs/001-foundation/](docs/specs/001-foundation/) — the SDD for **Fase 1** (the "rails"): the concrete tasks that stand up the guardrails below. Read [tasks.md](docs/specs/001-foundation/tasks.md) for the current work-list.

Before writing feature code, read the constitution and the relevant `docs/specs/NNN-*/` folder.

## Commands

Package manager is **pnpm** (there is a `pnpm-lock.yaml`; do not use npm/yarn).

Currently available (from `package.json`):

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server (http://localhost:3000) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (flat config: `eslint-config-next` core-web-vitals + typescript) |

There is **no test runner, `typecheck` script, or database yet** — they are deliverables of Fase 1. Once that phase lands, [docs/specs/001-foundation/quickstart.md](docs/specs/001-foundation/quickstart.md) defines the intended scripts: `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `db:up`/`db:migrate`/`db:seed`, and `setup`. A single test will then be `pnpm vitest run <file>` or `pnpm vitest run -t "<name>"`. Add scripts to `package.json` per that quickstart rather than inventing new conventions.

## Architecture — the binding rules

These come from [docs/spec.md](docs/spec.md). Violating them should break the build/lint/tests, not just review:

- **Dependency rule.** Dependencies point inward: `presentation → application → domain`, and `infrastructure → application/domain`. **`domain/` imports nothing** from other layers or from framework/infra (no Next, no Prisma, no Auth.js).
- **Bounded contexts are isolated.** Each module under `src/modules/<ctx>/` exposes **one public API** via its `index.ts`. **No deep-imports** across modules (`@/modules/x/infrastructure/...` from module `y` is forbidden). Contexts communicate through another module's application API or via **domain events** (in-memory `EventBus` port). The four contexts: `identity` (AuthN only), `tenancy` (orgs, memberships, invitations, **authorization**), `datasets` (thin), `analytics` (analysis state machine, dashboards, insights). Dependency arrows point toward `identity`/`tenancy`; `identity` does not know `tenancy`.
- **Multitenancy is a guaranteed property, not a convention.** Shared DB + `tenantId` discriminator + Postgres **Row-Level Security**. A `TenantContext` (in `shared/application`) carries the active tenant to the repository; repositories filter by `tenantId` and RLS is the safety net. The app connects with a role **without `BYPASSRLS`** and tables use `FORCE ROW LEVEL SECURITY`. Isolation is proven by `tests/isolation/` — cross-tenant reads must return **zero rows**. See [docs/specs/001-foundation/data-model.md](docs/specs/001-foundation/data-model.md).
- **Guardrails that make the project "impossible to disorganize by accident"** (Fase 1): strict TS (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) + ESLint architecture boundaries (`eslint-plugin-boundaries`) + `tests/architecture/` fitness tests + Zod env fail-fast in `src/config/env.ts` + Prisma **`migrate dev` only, never `db push`**.
- **`app/` is a dumb entry adapter.** A `page.tsx`/`route.ts` resolves context, invokes a use case (via the module's `di.ts`), and renders/responds — **no business logic**. `middleware.ts` runs on **Edge**: only redirects and cheap session checks, **no Prisma**.
- **Errors.** Use cases return `Result<T, DomainError>` for **expected** errors (duplicate email, permission denied, invalid input); **unexpected** errors throw and surface at the segment's `error.tsx`. Validate external input (forms, webhooks, microservice responses) with Zod **at the boundary**. Primitives (`Result`, `DomainError`, `TenantContext`) live in `src/shared/`.
- **Authorization is domain logic** and lives in `tenancy` (role→permission matrix). It runs on the **server inside use cases**; UI guards are cosmetic only. `config/` never contains permissions.

Target directory layout and ADRs are in [docs/spec.md](docs/spec.md) §6 and §8 — consult it before creating new folders, so `src/` grows into the specified structure.

## Spec-Driven Development workflow

This project uses SDD. Each phase/feature is a numbered folder `docs/specs/NNN-name/` containing `spec.md` (what/why + FR/NFR/SC), `plan.md` (how), `tasks.md` (step-by-step), `data-model.md`, `research.md` (decisions + rejected alternatives), `quickstart.md` (run/verify), and `checklists/requirements.md` (acceptance gate). When implementing, work from `tasks.md` and treat each `SC-00x` (Success Criterion) as done only when reproducible with a command.

## UI / component conventions

shadcn is configured with the **`base-nova`** style over **Base UI** primitives (`@base-ui/react`), **not** Radix. Tailwind is **v4** (CSS-first: no `tailwind.config`; theme in `src/app/globals.css` via CSS variables; `@tailwindcss/postcss`). RSC is enabled. When adding UI:

- Use `pnpm dlx shadcn@latest add <component>` (it reads `components.json`); resulting components use `@base-ui/react` primitives, `cva` variants, `data-slot` attributes, and `cn()` from `@/lib/utils`.
- Import aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`, and `@/*` → `src/*`. Fase 1 adds `@/modules`, `@/shared`, `@/config`.
- Icons: `lucide-react`.

## First files to read

[docs/spec.md](docs/spec.md) (constitution) → [docs/specs/001-foundation/spec.md](docs/specs/001-foundation/spec.md) → [docs/specs/001-foundation/tasks.md](docs/specs/001-foundation/tasks.md).
