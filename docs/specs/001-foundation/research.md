# Fase 1 — Research y decisiones

- **Feature:** `001-foundation`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

> Cada decisión lista: contexto, opción elegida, alternativas descartadas y racional. Las que quedaron abiertas en el [spec.md](spec.md) §11 se cierran aquí.

---

## R1 — Flags de TypeScript estricto real *(FR-001)*
- **Contexto:** `strict: true` por sí solo no cubre accesos indexados ni `override`.
- **Decisión:** activar `noUncheckedIndexedAccess` (todo acceso `arr[i]`/`obj[k]` se tipa como `T | undefined`) y `noImplicitOverride` (obliga la palabra `override`). Aliases `@/modules`, `@/shared`, `@/config`.
- **Alternativas:** añadir también `exactOptionalPropertyTypes` y `noPropertyAccessFromIndexSignature`. **Descartado por ahora**: el enunciado nombra exactamente esos tres; se pueden añadir en una fase posterior sin coste.
- **Racional:** convierte errores silenciosos (índice fuera de rango, `override` fantasma) en errores de compilación → "imposible de desordenar" empieza en el compilador.

## R2 — Fronteras de arquitectura: `eslint-plugin-boundaries` *(FR-002, cierra Q2)*
- **Contexto:** hay que **prohibir por configuración** los imports que rompen la regla de dependencia y los *deep-imports* entre módulos.
- **Decisión:** `eslint-plugin-boundaries` como fuente de verdad (feedback en editor + CI), **más** un test de arquitectura de respaldo en `tests/architecture/`.
- **Alternativas:**
  - `dependency-cruiser`: excelente para grafos y reglas, pero es un paso aparte de ESLint; se usará opcionalmente para visualizar el grafo, no como *gate* primario.
  - `eslint-plugin-import` (`no-restricted-paths`): válido, pero `boundaries` modela mejor "elementos" y "capas".
- **Racional:** la constitución (ADR-005) pide linter **y** test; `boundaries` da el bloqueo inmediato y barato; el test evita que desactivar el plugin abra la puerta.
- **Nota:** confirmar la API de configuración flat (ESLint 9) con Context7 al implementar.

## R3 — Validación de env: Zod a mano en `env.ts` *(FR-003, cierra Q1)*
- **Contexto:** el proceso debe morir en build/arranque si falta `AUTH_SECRET`, no en producción.
- **Decisión:** módulo `src/config/env.ts` (`import "server-only"`) que parsea `process.env` con un esquema Zod al cargarse; en error, `throw` con los `issues` formateados. `next.config.ts` lo importa para forzar el fail-fast en `next build`.
- **Alternativas:** `@t3-oss/env-nextjs` (separa cliente/servidor y evita fugas `NEXT_PUBLIC_*`). **Descartado por defecto** para ser fiel al enunciado ("Zod en `config/env.ts`") y no añadir dependencia; se reconsiderará cuando aparezcan variables públicas de cliente.
- **Racional:** una sola fuente de verdad tipada para el entorno; el fallo es determinista y nombra la variable.
- **Seguridad:** `server-only` evita que el módulo (y `AUTH_SECRET`) acabe en el bundle del cliente.

## R4 — Postgres + Prisma con `migrate`, nunca `db push` *(FR-004)*
- **Contexto:** el schema debe evolucionar de forma versionada y reproducible desde el día uno.
- **Decisión:** `prisma migrate dev` con migraciones en `prisma/migrations/`. Local con Docker (`postgres:16`), remoto con **Neon**. `package.json` no expone `db push`.
- **Alternativas:** `prisma db push` (rápido en prototipos) → **descartado**: no deja historial, imposible de auditar/revertir, y "un proyecto que llegará a producción" no debe nacer así.
- **Racional:** migraciones = historia revisable del schema; requisito para meter RLS como SQL versionado.
- **Versión:** Prisma **7** (driver adapters). La conexión sale del schema: `prisma.config.ts` (migraciones/CLI, `DIRECT_URL`) + `@prisma/adapter-pg` en runtime (`DATABASE_URL`). El generador `prisma-client-js` (Prisma ≤ 6) se descartó por quedar deprecado en 7; se usa `prisma-client` con `output` propio.

## R5 — Neon como Postgres remoto *(FR-004)*
- **Contexto:** se necesita un Postgres gestionado para entornos remotos, compatible con RLS.
- **Decisión:** **Neon**. Usar `DATABASE_URL` (conexión *pooled*) para la app y `DIRECT_URL` (conexión directa) para `prisma migrate`.
- **Alternativas:** Supabase (RLS de primera clase, pero trae más plataforma de la necesaria en Fase 1); RDS/otros (más operación). **Descartados** para esta fase.
- **Racional:** serverless, buen encaje con Next.js/Vercel; el patrón `DATABASE_URL`+`DIRECT_URL` es el recomendado por Prisma para poolers.

## R6 — RLS real (no cosmética) *(NFR-007)*
- **Contexto:** si Prisma conecta como owner/superusuario, RLS **no** se aplica y el aislamiento sería falso.
- **Decisión:** rol de app `NOBYPASSRLS`; `ENABLE` + `FORCE ROW LEVEL SECURITY`; policy por `current_setting('app.current_tenant')`; el repositorio hace `SET LOCAL` dentro de la transacción.
- **Alternativas:** confiar solo en `where tenantId` en cada repositorio → **descartado**: un olvido = fuga entre tenants; RLS es la red de seguridad.
- **Racional:** defensa en profundidad; el fallo seguro es "cero filas". Verificado por el test de aislamiento (SC-006).
- **Nota:** confirmar con Context7 el patrón vigente de `SET LOCAL` + transacciones en Prisma 7 con el driver adapter `@prisma/adapter-pg` (`$transaction` / `$executeRaw`).

## R7 — `Result<T, E>` + `DomainError` *(FR-005)*
- **Contexto:** distinguir errores **esperados** (email duplicado, permiso denegado, título vacío) de **inesperados**.
- **Decisión:** los casos de uso devuelven `Result<T, DomainError>`; los errores inesperados sí lanzan y suben al `error.tsx` correspondiente.
- **Alternativas:** excepciones para todo (control de flujo por `try/catch`, ruidoso y fácil de tragar); librerías tipo `neverthrow`. **Descartado** añadir dependencia: una `Result` mínima propia basta y mantiene el dominio sin terceros.
- **Racional:** errores esperados como valores → el compilador obliga a manejarlos.

## R8 — Vitest como runner *(FR-007)*
- **Contexto:** hace falta un test de dominio puro en verde y, más adelante, integración/aislamiento.
- **Decisión:** Vitest, con configuración que separe el proyecto de dominio (sin DB, sin Next) del de integración/aislamiento (Postgres real).
- **Alternativas:** Jest (más pesado con ESM/TS en este stack). **Descartado** por fricción de configuración con el toolchain actual (Vite/ESM, TS 5).
- **Racional:** arranque rápido, ESM/TS nativo, buena DX; el test de dominio no debe tocar infraestructura (NFR-005).

## R9 — Módulo de ejemplo como plantilla *(FR-006)*
- **Contexto:** "un junior copia patrones, no lee documentos".
- **Decisión:** `modules/example` con las 4 capas, `di.ts` e `index.ts`, marcado como **referencia desechable**.
- **Alternativas:** usar directamente un módulo real reducido (p. ej. `tenancy` mínimo) → **descartado**: arrastra `identity`/membresías y mezcla features con rieles; la Fase 1 es infraestructura de disciplina, no producto.
- **Racional:** plantilla copiable, aislada, que ejercita todas las primitivas y el patrón tenant-scoped end-to-end.

---

## Decisiones cerradas del spec
- **Q1** → R3 (Zod a mano).
- **Q2** → R2 (`eslint-plugin-boundaries` + test de arquitectura).
- **Q3** → Node ≥ 20 LTS, fijado en `engines` + `.nvmrc` (ver [tasks.md](tasks.md) T001).

## Recordatorio de implementación
Antes de escribir código contra Prisma, Zod, ESLint/boundaries, Vitest o Auth.js, **consultar Context7** para la API vigente de cada versión (guía global). Los snippets de estos artefactos son ilustrativos.
