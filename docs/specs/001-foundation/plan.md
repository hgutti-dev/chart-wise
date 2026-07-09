# Fase 1 — Plan técnico de implementación

- **Feature:** `001-foundation`
- **Spec:** [spec.md](spec.md) · **Constitución:** [../../spec.md](../../spec.md)
- **Estado:** Draft para revisión

> Este plan traduce los requisitos (FR/NFR/SC) del [spec.md](spec.md) en decisiones técnicas concretas y una secuencia de trabajo. El desglose accionable vive en [tasks.md](tasks.md).

---

## 1. Enfoque

Montar los rieles en **7 slices** que se cierran de forma incremental, cada uno con un criterio de verificación observable (no "parece que funciona"). El orden respeta las dependencias: primero el compilador y el linter (rieles que fallan barato), luego env y base de datos, luego las primitivas y el módulo de ejemplo, y por último el test que ata todo.

**Principio rector:** cada riel se considera *hecho* solo cuando su Criterio de Éxito asociado (SC-00x) es reproducible con un comando.

## 2. Stack y versiones

| Área | Elección | Versión objetivo | Racional (detalle en [research.md](research.md)) |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.x (ya instalado) | Base del proyecto. |
| Runtime | Node | ≥ 20 LTS (fijar en `engines` + `.nvmrc`) | Requerido por Next 16 / Prisma 7. |
| Gestor de paquetes | pnpm | ya en uso | `pnpm-lock.yaml` presente. |
| Lenguaje | TypeScript | 5.x (ya instalado) | Flags estrictos (FR-001). |
| Linter | ESLint (flat config) + `eslint-plugin-boundaries` | ESLint 9 (ya instalado) | Fronteras por configuración (FR-002). |
| Validación env | Zod | 3.x/4.x | Fail-fast (FR-003). |
| ORM | Prisma | 6.x | `migrate dev` (FR-004). |
| DB local | PostgreSQL vía Docker | `postgres:16` | Reproducible. |
| DB remota | Neon (Postgres serverless) | — | `DATABASE_URL` + `DIRECT_URL`. |
| Tests | Vitest | 2.x/3.x | Test de dominio puro (FR-007). |

> **Nota de disciplina (global CLAUDE.md):** en la fase de implementación, **antes** de escribir código contra Prisma, Zod, `eslint-plugin-boundaries`, Vitest o Auth.js, consultar **Context7** (`resolve-library-id` → `get-library-docs`) para trabajar con la API vigente de cada versión. Los snippets de estos artefactos son **ilustrativos** y deben validarse contra la doc actual.

## 3. Decisiones de diseño (resumen; racional en research.md)

- **D1 — Fronteras: `eslint-plugin-boundaries` como fuente de verdad + test de arquitectura de respaldo.** El linter bloquea en el editor/CI (feedback inmediato). Un test en `tests/architecture/` replica la regla para que el fallo también rompa la suite. *(FR-002)*
- **D2 — `env.ts` con Zod a mano, importado por `next.config.ts`.** Un único módulo `server-only` que parsea `process.env` al cargarse. Importarlo desde `next.config.ts` fuerza el fail-fast en `next build`. *(FR-003)*
- **D3 — RLS real, no cosmética.** La app se conecta con un rol **sin `BYPASSRLS`**; las tablas *scoped* usan `ENABLE` + `FORCE ROW LEVEL SECURITY`; el repositorio hace `SET LOCAL app.current_tenant = <tenantId>` dentro de la transacción, y la *policy* filtra por `current_setting('app.current_tenant')`. Prisma no gestiona RLS: el SQL va como migración con `--create-only` editada a mano. *(FR-004, NFR-007)*
- **D4 — Módulo `example` como plantilla desechable.** Demuestra las 4 capas + `di.ts` + `index.ts`. Está marcado como referencia: se elimina o se sustituye cuando lleguen los módulos reales. *(FR-006)*
- **D5 — `Result<T, E>` sin excepciones para errores esperados.** Los casos de uso devuelven `Result`; `DomainError` es la base de los errores esperados. Los inesperados sí lanzan. *(FR-005)*

## 4. Plan por slices

### Slice A — TypeScript estricto real *(FR-001 → SC-001)*
Editar `tsconfig.json`: añadir `noUncheckedIndexedAccess`, `noImplicitOverride` y los aliases `@/modules/*`, `@/shared/*`, `@/config/*`. Añadir script `typecheck` (`tsc --noEmit`).
**Verificación:** un acceso indexado sin guard produce error de tipo.

### Slice B — Linter con fronteras de arquitectura *(FR-002 → SC-002, SC-003, SC-009)*
Instalar `eslint-plugin-boundaries`. En `eslint.config.mjs`: declarar los elementos (`domain`, `application`, `infrastructure`, `presentation`, `module`, `shared`, `config`, `app`), sus reglas de dependencia y `no-restricted-imports` para bloquear framework/infra dentro de `domain/` y *deep-imports* entre módulos.
**Verificación:** los imports prohibidos rompen `pnpm lint`.

### Slice C — Env fail-fast con Zod *(FR-003 → SC-004)*
Crear `src/config/env.ts` (`server-only`) con esquema Zod (`AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `NODE_ENV`). Parsear al cargar; en error, `throw` con mensaje formateado. Importar `env` en `next.config.ts`.
**Verificación:** sin `AUTH_SECRET`, `next build` aborta nombrando la variable.

### Slice D — Postgres + Prisma + primera migración multitenant *(FR-004 → SC-005, SC-008)*
`docker-compose.yml` (`postgres:16`). Instalar Prisma; `schema.prisma` con `Tenant` y `Note` (tenant-scoped). Generar la migración con `prisma migrate dev --create-only`, **editar el SQL** para añadir RLS (`ENABLE`+`FORCE`+`CREATE POLICY`) y aplicarla. Scripts `db:up`, `db:migrate`; **sin** `db push`.
**Verificación:** `prisma migrate status` ≥ 1 migración; el SQL contiene las sentencias RLS.

### Slice E — Primitivas compartidas *(FR-005 → soporta SC-006/007)*
`src/shared/domain/result.ts`, `src/shared/domain/domain-error.ts`, `src/shared/application/tenant-context.ts` (+ `index.ts` de `shared` si aplica). Sin imports de framework/infra.
**Verificación:** el test de arquitectura confirma pureza; se usan en el módulo de ejemplo.

### Slice F — Esqueleto + módulo `example` *(FR-006 → SC-009)*
Crear el árbol de `src/` y `tests/`. Módulo `example` completo: `domain/entities/note.ts`, `domain/value-objects/note-title.ts`, `domain/errors/`, `domain/ports/note.repository.ts`, `application/use-cases/create-note.ts`, `infrastructure/persistence/prisma-note.repository.ts` (+ mapper), `di.ts`, `index.ts`.
**Verificación:** el `index.ts` es la única superficie importable; lint lo comprueba.

### Slice G — Vitest + test de dominio + test de aislamiento *(FR-007 → SC-006, SC-007)*
`vitest.config.ts` con proyectos/entornos separados (dominio puro vs. integración). Test de dominio: `Note.create` devuelve `Result.ok`/`Result.err(DomainError)`. Test de aislamiento (integración): tenant B no ve la `Note` del tenant A.
**Verificación:** `vitest run` en verde; el test de aislamiento recibe cero filas cruzando tenants.

## 5. Estructura entregada (subconjunto de la constitución §6)

```
chart-wise/
├── docker-compose.yml            # postgres:16 local
├── vitest.config.ts
├── eslint.config.mjs             # + reglas de frontera
├── next.config.ts                # importa src/config/env.ts (fail-fast en build)
├── prisma/
│   ├── schema.prisma             # Tenant + Note (scoped)
│   ├── migrations/               # 1ª migración incluye RLS
│   └── seed.ts                   # tenants A y B para tests de aislamiento
├── tests/
│   ├── unit/                     # dominio (sin DB, sin Next)
│   ├── integration/
│   ├── isolation/                # cross-tenant → cero filas
│   └── architecture/             # regla de dependencia como test
└── src/
    ├── config/env.ts
    ├── shared/
    │   ├── domain/{result.ts,domain-error.ts,entity.ts}
    │   └── application/tenant-context.ts
    └── modules/example/
        ├── domain/{entities,value-objects,errors,ports}
        ├── application/use-cases/
        ├── infrastructure/persistence/
        ├── di.ts
        └── index.ts
```

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| RLS "de mentira" (Prisma conecta como owner/superuser) | El aislamiento no se aplica y nadie lo nota | Rol de app sin `BYPASSRLS` + `FORCE ROW LEVEL SECURITY`; test de aislamiento bloqueante (SC-006) |
| `env.ts` se ejecuta en el cliente y filtra secretos | Fuga de `AUTH_SECRET` al bundle | `server-only` + separar env pública (`NEXT_PUBLIC_*`) si aparece |
| Reglas de `boundaries` mal calibradas (falsos positivos) | Fricción para el equipo | Empezar estricto en `domain/` y fronteras de módulo; iterar con el test de arquitectura como red |
| `db push` "de rescate" en local | El schema deja de derivar de migraciones | No exponer script; documentar la prohibición (SC-008) |
| APIs de librerías cambiadas entre versiones | Snippets que no compilan | Confirmar con Context7 en implementación (ver §2) |

## 7. Definición de "hecho" (fase)

La Fase 1 está completa cuando **todos** los SC-001..SC-009 son verdes de forma reproducible y [checklists/requirements.md](checklists/requirements.md) está íntegramente marcado. Verificación end-to-end en [quickstart.md](quickstart.md).
