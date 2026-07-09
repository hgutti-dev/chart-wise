# Fase 1 — Fundación: rieles del proyecto

- **Feature:** `001-foundation`
- **Estado:** Implementado
- **Fecha:** 2026-07-09
- **Constitución:** [../../spec.md](../../spec.md) — este spec **hereda** sus principios y no los repite.
- **Artefactos hermanos:** [plan.md](plan.md) · [tasks.md](tasks.md) · [data-model.md](data-model.md) · [research.md](research.md) · [quickstart.md](quickstart.md) · [checklists/requirements.md](checklists/requirements.md)

> **Regla de oro de la fase:** al terminar, un desarrollador junior debe poder **copiar el módulo de ejemplo** y trabajar sin salirse del carril, porque las herramientas (compilador, linter, migraciones, tests) **le impiden** desordenar el proyecto por accidente. Los documentos no vigilan; las herramientas sí.

---

## 1. Objetivo

Dejar montados los **rieles** del proyecto de forma que:

1. **Sea imposible desordenar el proyecto por accidente.** Romper la regla de dependencia, hacer un *deep-import* entre módulos, olvidar validar una variable de entorno o meter lógica en la capa equivocada debe **fallar el build o el lint**, no depender de disciplina ni de revisión manual.
2. **El schema contemple la multitenancy desde el primer `migrate`.** La primera migración ya incluye el discriminador `tenantId` y **Row-Level Security (RLS)** de Postgres. No existe ningún estado del schema que haya nacido sin aislamiento por tenant.

Esta fase **no** implementa features de producto. Entrega la infraestructura de disciplina + un **módulo de ejemplo completo** que sirve de plantilla.

## 2. Alcance

**Incluye (los 7 rieles):**

1. TypeScript en modo estricto real (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) + path aliases `@/modules`, `@/shared`, `@/config`.
2. Linter con **reglas de arquitectura** que prohíben por configuración los imports que rompen la regla de dependencia y los *deep-imports* entre módulos.
3. Validación de variables de entorno con **Zod** en `src/config/env.ts`, ejecutada al arrancar y en build (fail-fast).
4. **PostgreSQL + Prisma**: local con Docker, remoto con **Neon**. Flujo `prisma migrate dev` desde el día uno; **`db push` prohibido**. Primera migración con `tenantId` + RLS.
5. Primitivas compartidas: `Result<T, E>`, `DomainError` base y `TenantContext` en `src/shared/`.
6. **Esqueleto de carpetas** con un **módulo de ejemplo completo** (`modules/example`) y su `index.ts` como única API pública.
7. **Vitest** configurado con al menos **un test de dominio en verde**.

**No incluye (fuera de alcance):** ver §9.

## 3. Usuarios y escenarios

El "usuario" de esta fase es **el propio equipo de desarrollo**. Las historias justifican cada riel.

- **DEV-01** — Como **junior**, quiero **copiar un módulo de ejemplo** que ya trae las cuatro capas y su `index.ts`, para escribir features sin leer documentación de arquitectura. *(→ FR-006)*
- **DEV-02** — Como **desarrollador**, quiero que el **compilador me frene** cuando accedo a un índice sin comprobarlo o cuando escribo un `override` inexistente, para no arrastrar bugs silenciosos. *(→ FR-001)*
- **DEV-03** — Como **desarrollador**, quiero que el **linter rechace** un import que rompe la regla de dependencia (p. ej. `domain/` importando Prisma) o un *deep-import* entre módulos, **antes** de abrir el PR. *(→ FR-002)*
- **DEV-04** — Como **operador**, quiero que el proceso **muera en el build** si falta `AUTH_SECRET`, no en producción a las 3 a. m. *(→ FR-003)*
- **DEV-05** — Como **desarrollador**, quiero un **flujo de migraciones versionado** (`migrate dev`) desde el commit inicial, para que la evolución del schema sea reproducible y revisable. *(→ FR-004)*
- **DEV-06** — Como **desarrollador**, quiero **primitivas compartidas** (`Result`, `DomainError`, `TenantContext`) ya disponibles, para modelar errores esperados sin `try/catch` ni acoplar el dominio. *(→ FR-005)*
- **DEV-07** — Como **equipo**, quiero que el **aislamiento entre tenants** exista desde la primera migración y esté **probado**, para que ningún feature futuro pueda nacer sin él. *(→ FR-004, FR-007, SC-006)*

## 4. Requisitos funcionales

- **FR-001 — TypeScript estricto real.** `tsconfig.json` DEBE tener `strict: true`, `noUncheckedIndexedAccess: true` y `noImplicitOverride: true`, y DEBE declarar los path aliases `@/modules/*`, `@/shared/*`, `@/config/*` (además del `@/*` existente).
- **FR-002 — Fronteras de arquitectura por configuración.** El linter DEBE prohibir: (a) que cualquier archivo bajo `**/domain/**` importe `next`, `@prisma/client`/`prisma`, `next-auth`/`@auth/*` o cualquier paquete de infraestructura; (b) todo *deep-import* entre módulos (`@/modules/<x>/(domain|application|infrastructure|presentation)/...` desde otro módulo — solo se permite `@/modules/<x>` = su `index.ts`); (c) importaciones que violen la dirección de dependencia entre capas (`presentation → application → domain`, `infrastructure → application/domain`).
- **FR-003 — Env fail-fast con Zod.** `src/config/env.ts` DEBE validar las variables de entorno del servidor con un esquema Zod y **abortar** (build y arranque) con un mensaje que nombre la variable ausente/ inválida. `next.config.ts` DEBE importar `env.ts` para forzar la validación en `next build`.
- **FR-004 — Prisma + Postgres con migraciones y multitenancy desde la primera migración.** El proyecto DEBE usar `prisma migrate dev` (versionado en `prisma/migrations/`). `package.json` **no** DEBE contener ningún script con `prisma db push`. La **primera migración** DEBE crear el discriminador multitenant (columna `tenantId`) en las tablas *scoped* y **habilitar RLS** (`ENABLE` + `FORCE ROW LEVEL SECURITY`) con una *policy* que filtre por el tenant activo. Debe existir un `docker-compose.yml` para Postgres local y `env.ts` DEBE soportar `DATABASE_URL` + `DIRECT_URL` (Neon).
- **FR-005 — Primitivas compartidas.** `src/shared/` DEBE exponer: `Result<T, E>` (con `ok`/`err` y helpers), `DomainError` (clase base para errores esperados) y `TenantContext` (transporta el `tenantId` activo hasta el repositorio). Ninguna de estas primitivas DEBE importar framework ni infraestructura.
- **FR-006 — Esqueleto + módulo de ejemplo completo.** DEBE existir el árbol de carpetas de `src/` (config, shared, modules, tests) y un módulo `modules/example` con las cuatro capas, `di.ts` y `index.ts` (única API pública), demostrando el uso de `Result`, `DomainError`, `TenantContext` y un repositorio Prisma tenant-scoped.
- **FR-007 — Vitest con test de dominio en verde.** Vitest DEBE estar configurado (`vitest run` ejecutable) y DEBE existir **al menos un test de dominio** del módulo de ejemplo, puro (sin DB, sin Next), **pasando**.

## 5. Requisitos no funcionales

- **NFR-001** — `domain/` de cualquier módulo NO DEBE importar Next.js, Prisma, Auth.js ni infraestructura (verificado por lint **y** por un test de arquitectura).
- **NFR-002** — Ningún módulo DEBE importar rutas internas de otro módulo; solo su `index.ts`.
- **NFR-003** — El build/arranque DEBE fallar de forma determinista y con mensaje claro si falta o es inválida una variable de entorno requerida.
- **NFR-004** — El estado del schema DEBE derivar exclusivamente de migraciones versionadas; el aislamiento por tenant (`tenantId` + RLS) DEBE existir desde la primera migración.
- **NFR-005** — El test de dominio requerido DEBE correr sin red ni servicios externos (dominio puro).
- **NFR-006** — Los scripts de `package.json` DEBEN hacer evidente el "camino feliz" (`setup`, `db:up`, `db:migrate`, `test`, `lint`, `typecheck`) para que el flujo correcto sea el más fácil de seguir.
- **NFR-007** — El aislamiento por RLS DEBE aplicarse incluso al dueño de la tabla: la conexión de la app usa un rol **sin** `BYPASSRLS` y las tablas usan `FORCE ROW LEVEL SECURITY`.

## 6. Criterios de éxito (medibles)

- **SC-001** — Con `noUncheckedIndexedAccess`, un acceso indexado sin comprobación (`arr[0].foo`) produce **error de tipo** en `tsc --noEmit`. *(FR-001)*
- **SC-002** — `pnpm lint` **falla** si un archivo bajo `**/domain/**` importa `@prisma/client`, `next` o `next-auth`. *(FR-002 / NFR-001)*
- **SC-003** — `pnpm lint` **falla** ante un *deep-import* `@/modules/example/infrastructure/...` realizado desde otro módulo. *(FR-002 / NFR-002)*
- **SC-004** — `next build` (o `pnpm typecheck`/arranque) **aborta** si falta `AUTH_SECRET` o `DATABASE_URL`, e imprime el nombre de la variable. *(FR-003 / NFR-003)*
- **SC-005** — `prisma migrate status` reporta ≥ 1 migración aplicada; el SQL de la primera migración contiene `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y una `CREATE POLICY` sobre la tabla *scoped*. *(FR-004 / NFR-004)*
- **SC-006** — Existe un test en `tests/isolation/` que, con el tenant B activo, intenta leer un registro creado en el tenant A y **recibe cero filas** (aunque el `where tenantId` se omita, RLS niega). *(FR-004 / NFR-007)*
- **SC-007** — `vitest run` termina en verde e incluye al menos un test de dominio del módulo de ejemplo. *(FR-007 / NFR-005)*
- **SC-008** — `package.json` define `db:migrate` = `prisma migrate dev` y **no** define ningún script que invoque `prisma db push`; [quickstart.md](quickstart.md) documenta la prohibición. *(FR-004)*
- **SC-009** — El módulo `modules/example` expone su API únicamente por `index.ts`; un import externo a cualquier capa interna del módulo es rechazado por el linter. *(FR-006 / NFR-002)*

## 7. Entidades clave (resumen)

Detalle completo en [data-model.md](data-model.md).

| Entidad | Rol en la Fase 1 | Notas |
|---|---|---|
| `Tenant` | Raíz de tenancy; ancla del aislamiento. | Sembrada (seed) para las pruebas; el módulo `tenancy` real llega en una fase posterior. |
| `Note` (módulo `example`) | Agregado *scoped* a tenant que demuestra el patrón completo. | Tabla con `tenantId` + RLS. Placeholder de referencia. |
| `TenantContext` | Transporta el `tenantId` activo hasta el repositorio. | Vive en `shared/application`. |

## 8. Edge cases

- **Falta una variable de entorno** → el build/arranque muere nombrando la variable (no arranca a medias). *(SC-004)*
- **Deep-import entre módulos** → el linter lo rechaza antes del PR; el mensaje indica que solo `index.ts` es importable. *(SC-003)*
- **Intento de `prisma db push`** → no existe script; el flujo documentado y disponible es `migrate dev`. *(SC-008)*
- **Repositorio que olvida `where tenantId`** → RLS niega igual el acceso cruzado (defensa en profundidad). *(SC-006)*
- **Test de dominio que necesitara una DB** → prohibido: el dominio es puro; si un test de dominio requiere DB, es un *smell* de diseño. *(NFR-005)*
- **Conexión Prisma con rol superusuario** → RLS no aplicaría; por eso la app usa un rol sin `BYPASSRLS` y `FORCE ROW LEVEL SECURITY`. *(NFR-007)*

## 9. Fuera de alcance (Fase 1)

- Autenticación real (wiring de Auth.js) y cualquier UI de features.
- Los módulos reales `identity`, `tenancy`, `datasets`, `analytics` (solo se prepara el patrón).
- El microservicio de análisis y su contrato.
- Suite E2E completa (Playwright) y pipeline de CI/CD.
- Estrategia de despliegue y observabilidad.

## 10. Supuestos y dependencias

- Docker Desktop disponible localmente; cuenta de **Neon** para el Postgres remoto.
- Node ≥ 20 y **pnpm** como gestor de paquetes (hay `pnpm-lock.yaml` y `pnpm-workspace.yaml`).
- El proyecto ya está inicializado como Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn.

## 11. Preguntas abiertas (no bloqueantes)

- **Q1** — ¿Zod "a mano" en `env.ts` o `@t3-oss/env-nextjs`? → decisión en [research.md](research.md) (por defecto: Zod a mano, fiel al enunciado).
- **Q2** — ¿`eslint-plugin-boundaries` o `dependency-cruiser` como fuente de verdad de las fronteras? → [research.md](research.md).
- **Q3** — Versión de Node a fijar (`.nvmrc`/`engines`) → se cierra en [plan.md](plan.md).
