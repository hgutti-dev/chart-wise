# chart-wise

SaaS multi-tenant donde un usuario, dentro de una **organización (tenant)**, sube datasets, los envía a un **microservicio de análisis externo (FastAPI)** y visualiza los resultados como **dashboards e insights**.

> **Estado:** spec-first / pre-implementación. El código de `src/` es todavía un scaffold; la arquitectura está especificada y es **vinculante** en `docs/`. La **Fase 1** (montar los rieles) está en curso.

## Stack

- **Next.js 16** (App Router, RSC) · **React 19** · **TypeScript** (strict)
- **Tailwind v4** (CSS-first) · **shadcn** (estilo `base-nova`) sobre **Base UI** (`@base-ui/react`) · `lucide-react`
- **Fase 1:** PostgreSQL + Prisma · Zod · Vitest
- Gestor de paquetes: **pnpm**

## Arranque

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Otros comandos disponibles: `pnpm build`, `pnpm start`, `pnpm lint`.
La Fase 1 añadirá `typecheck`, `test` y `db:*` — ver [docs/specs/001-foundation/quickstart.md](docs/specs/001-foundation/quickstart.md).

## Arquitectura

La fuente de verdad es `docs/`, no `src/`:

- **[docs/spec.md](docs/spec.md)** — la **constitución**: Clean Architecture (Hexagonal / Ports & Adapters) + DDD + multitenancy real (`tenantId` + RLS de Postgres). Sus principios son normativos.
- **[docs/specs/001-foundation/](docs/specs/001-foundation/)** — el SDD de la **Fase 1** (los rieles): TypeScript estricto real, fronteras de arquitectura por linter, validación de entorno fail-fast con Zod, Prisma con `migrate` desde el día uno, primitivas compartidas (`Result`, `DomainError`, `TenantContext`), esqueleto de carpetas con módulo de ejemplo y Vitest.

Reglas clave: la **regla de dependencia** (el `domain` no importa framework ni infraestructura), cada módulo expone únicamente su `index.ts` (sin *deep-imports*), y el **aislamiento por tenant** está garantizado por RLS y probado en `tests/isolation/`.

Para trabajar dentro del repo con Claude Code, ver [CLAUDE.md](CLAUDE.md).
