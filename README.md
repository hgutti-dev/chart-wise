# chart-wise

SaaS multi-tenant donde un usuario, dentro de una **organización (tenant)**, sube datasets, los envía a un **microservicio de análisis externo (FastAPI)** y visualiza los resultados como **dashboards e insights**.

> **Estado:** la **Fase 1** (fundaciones arquitectónicas) está implementada. La **Fase 2 — Autenticación** está especificada y en preparación. La arquitectura definida en `docs/` es vinculante.

## Stack

- **Next.js 16** (App Router, RSC) · **React 19** · **TypeScript** (strict)
- **Tailwind v4** (CSS-first) · **shadcn** (estilo `base-nova`) sobre **Base UI** (`@base-ui/react`) · `lucide-react`
- **Persistencia y calidad:** PostgreSQL · Prisma 7 · Zod · Vitest
- Gestor de paquetes: **pnpm**

## Arranque

```bash
pnpm install
# Copia .env.example a .env y completa las variables requeridas.
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev        # http://localhost:3000
```

`pnpm setup` ejecuta la instalación, el arranque de Postgres, las migraciones y el seed. Otros comandos disponibles: `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.

### Variables de entorno

`next.config.ts` valida el entorno antes de arrancar o compilar. En `.env` debes configurar `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `APP_URL`, `DATABASE_URL` y `DIRECT_URL`. Consulta [`.env.example`](.env.example) para la plantilla y [la guía de autenticación](docs/specs/002-authentication/quickstart.md) para el flujo de Google OAuth.

## Arquitectura

La fuente de verdad es `docs/`, no `src/`:

- **[docs/spec.md](docs/spec.md)** — la **constitución**: Clean Architecture (Hexagonal / Ports & Adapters) + DDD + multitenancy real (`tenantId` + RLS de Postgres). Sus principios son normativos.
- **[docs/specs/001-foundation/](docs/specs/001-foundation/)** — SDD implementado de la **Fase 1**: TypeScript estricto, fronteras verificadas por linter/tests, entorno fail-fast, Prisma 7, RLS, primitivas compartidas y Vitest.
- **[docs/specs/002-authentication/](docs/specs/002-authentication/)** — SDD de la **Fase 2**: identidad con Auth.js, credenciales, Google OAuth, JWT y verificación de email.

Reglas clave: la **regla de dependencia** (el `domain` no importa framework ni infraestructura), cada módulo expone únicamente su `index.ts` (sin *deep-imports*), y el **aislamiento por tenant** está garantizado por RLS y probado en `tests/isolation/`.

Para trabajar dentro del repo con Claude Code, ver [CLAUDE.md](CLAUDE.md).
