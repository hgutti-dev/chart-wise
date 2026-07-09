# Fase 1 — Tareas

- **Feature:** `001-foundation`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Data model:** [data-model.md](data-model.md)
- **Estado:** Pendiente

Convenciones: `[ ]` pendiente · `[x]` hecho. `[P]` = paralelizable (sin dependencia con las tareas [P] hermanas del mismo grupo). Cada tarea nombra el/los archivo(s) y el requisito que satisface.

---

## Fase 0 — Preparación

- [ ] **T001** Fijar runtime: añadir `engines.node >= 20` en `package.json` y crear `.nvmrc`. *(Q3)*
- [ ] **T002** Añadir scripts al `package.json`: `typecheck`, `lint`, `test`, `test:watch`, `db:up`, `db:down`, `db:migrate`, `db:seed`, `setup`. **Sin** ningún script con `prisma db push`. *(NFR-006, FR-004, SC-008)*

## Fase A — TypeScript estricto real *(FR-001 → SC-001)*

- [ ] **T010** Editar `tsconfig.json`: `noUncheckedIndexedAccess: true`, `noImplicitOverride: true` (mantener `strict: true`).
- [ ] **T011** Añadir path aliases en `tsconfig.json`: `@/modules/*`, `@/shared/*`, `@/config/*` (además de `@/*`).
- [ ] **T012** **Verificar SC-001**: introducir temporalmente un acceso indexado sin guard y comprobar que `pnpm typecheck` falla; revertir.

## Fase B — Linter con fronteras de arquitectura *(FR-002 → SC-002, SC-003, SC-009)*

- [ ] **T020** Instalar `eslint-plugin-boundaries` (dev). *(consultar Context7 por la API de la versión)*
- [ ] **T021** En `eslint.config.mjs`: definir `settings["boundaries/elements"]` para `config`, `shared`, `module`, `domain`, `application`, `infrastructure`, `presentation`, `app`.
- [ ] **T022** Regla de **dirección de dependencia** entre capas (`presentation → application → domain`; `infrastructure → application/domain`; `domain` no depende de nadie).
- [ ] **T023** `no-restricted-imports` en `**/domain/**`: prohibir `next`, `next/*`, `@prisma/client`, `prisma`, `next-auth`, `@auth/*`.
- [ ] **T024** Regla que prohíbe *deep-imports* entre módulos: solo `@/modules/<x>` (index) es importable desde otro módulo.
- [ ] **T025** **Verificar SC-002/SC-003/SC-009** con imports-trampa temporales; `pnpm lint` debe fallar en cada caso; revertir.

## Fase C — Env fail-fast con Zod *(FR-003 → SC-004)*

- [x] **T030** Instalar `zod` y `server-only` (dev/prod según corresponda).
- [x] **T031** `src/config/env.ts`: esquema Zod (`NODE_ENV`, `AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`); parsear `process.env` al cargar; en error `throw` con mensaje formateado (nombre de variable). `import "server-only"` arriba. *(Split en `env.schema.ts` sin `server-only` para que `next.config.ts` pueda importarlo.)*
- [x] **T032** `next.config.ts`: importar `./src/config/env` para forzar validación en `next build`.
- [x] **T033** `.env.example` con las variables requeridas (sin valores reales). *(seguridad: nunca commitear secretos)*
- [x] **T034** **Verificar SC-004**: sin `AUTH_SECRET`, `next build`/arranque aborta nombrando la variable.

## Fase D — Postgres + Prisma + primera migración multitenant *(FR-004 → SC-005, SC-008)*

- [x] **T040** `docker-compose.yml` con `postgres:16` (usuario/roles según [data-model.md](data-model.md) §RLS).
- [x] **T041** Instalar `prisma`/`@prisma/client` **v7** + `@prisma/adapter-pg`, `pg`, `dotenv`. `schema.prisma`: `datasource` sin URLs + generador `prisma-client` (`output = ../src/generated/prisma`). `prisma.config.ts` a mano: `datasource.url = env("DIRECT_URL")` (migraciones) con `dotenv`; el cliente runtime usa `DATABASE_URL` vía adapter. *(Prisma 7: conexión fuera del schema.)*
- [ ] **T042** Modelar en `schema.prisma`: `Tenant` y `Note` (tenant-scoped) según [data-model.md](data-model.md).
- [ ] **T043** Generar migración `--create-only` y **editar el SQL** para añadir: rol de app sin `BYPASSRLS`, `ENABLE`/`FORCE ROW LEVEL SECURITY` en `Note`, y `CREATE POLICY` por `current_setting('app.current_tenant')`.
- [ ] **T044** Aplicar con `prisma migrate dev`; confirmar `prisma migrate status` ≥ 1 migración.
- [ ] **T045** `prisma/seed.ts`: crear tenants A y B (para tests de aislamiento). Script `db:seed`.
- [ ] **T046** **Verificar SC-005/SC-008**: el SQL migrado contiene las sentencias RLS; `package.json` no tiene `db push`.

## Fase E — Primitivas compartidas *(FR-005)*

- [ ] **T050 [P]** `src/shared/domain/result.ts`: `Result<T, E>` con `ok`/`err`, `isOk`/`isErr`, `map`/`mapErr`, `unwrap`/`unwrapOr`.
- [ ] **T051 [P]** `src/shared/domain/domain-error.ts`: clase base `DomainError` (`name`, `message`, `code?`).
- [ ] **T052 [P]** `src/shared/application/tenant-context.ts`: `TenantContext` (transporta `tenantId`; opcional `userId`).
- [ ] **T053 [P]** `src/shared/domain/entity.ts` (base mínima) — opcional, si el módulo de ejemplo lo usa.
- [ ] **T054** Confirmar que ninguna primitiva importa framework/infra (lo cubre el test de arquitectura T072).

## Fase F — Esqueleto + módulo `example` *(FR-006 → SC-009)*

- [ ] **T060** Crear árbol de carpetas: `src/{config,shared,modules}`, `tests/{unit,integration,isolation,architecture}`.
- [ ] **T061** `modules/example/domain/value-objects/note-title.ts`: VO con validación (no vacío, longitud), devuelve `Result`.
- [ ] **T062** `modules/example/domain/errors/*`: p. ej. `EmptyNoteTitleError extends DomainError`.
- [ ] **T063** `modules/example/domain/entities/note.ts`: agregado `Note` con factory `create(...) : Result<Note, DomainError>`.
- [ ] **T064** `modules/example/domain/ports/note.repository.ts`: interfaz del repositorio (recibe `TenantContext`).
- [ ] **T065** `modules/example/application/use-cases/create-note.ts`: caso de uso que usa el puerto y devuelve `Result`.
- [ ] **T066** `modules/example/infrastructure/persistence/prisma-note.repository.ts` (+ mapper): implementa el puerto; hace `SET LOCAL app.current_tenant` desde el `TenantContext` y filtra por `tenantId`.
- [ ] **T067** `modules/example/di.ts`: composition root del módulo (real vs. fake según entorno).
- [ ] **T068** `modules/example/index.ts`: API pública (exporta solo el caso de uso / tipos necesarios).

## Fase G — Vitest: dominio + aislamiento *(FR-007 → SC-006, SC-007)*

- [ ] **T070** Instalar y configurar Vitest (`vitest.config.ts`), separando proyecto de dominio (sin DB) del de integración.
- [ ] **T071** `tests/unit/example/note.spec.ts`: test de dominio de `Note.create` (ok para válido, `DomainError` para título vacío). **Debe pasar.** *(SC-007)*
- [ ] **T072** `tests/architecture/dependency-rule.spec.ts`: test que falla si `domain/` importa framework/infra o si hay deep-imports (respaldo del linter). *(NFR-001)*
- [ ] **T073** `tests/isolation/note-tenant-isolation.spec.ts`: con tenant B activo, leer la `Note` del tenant A → **cero filas** (integración, requiere Postgres). *(SC-006)*
- [ ] **T074** **Verificar SC-007**: `pnpm test` (o `vitest run`) en verde.

## Fase H — Cierre

- [ ] **T080** Recorrer [quickstart.md](quickstart.md) end-to-end en limpio y confirmar cada comando.
- [ ] **T081** Marcar [checklists/requirements.md](checklists/requirements.md) al 100%.
- [ ] **T082** Confirmar SC-001..SC-009 verdes y actualizar el estado del [spec.md](spec.md) a "Implementado".

---

### Trazabilidad requisito → tareas

| Requisito | Tareas |
|---|---|
| FR-001 | T010, T011, T012 |
| FR-002 | T020–T025 |
| FR-003 | T030–T034 |
| FR-004 | T040–T046 |
| FR-005 | T050–T054 |
| FR-006 | T060–T068 |
| FR-007 | T070–T074 |
| SC-006 (aislamiento) | T043, T045, T066, T073 |
