# Fase 1 — Checklist de requisitos

- **Feature:** `001-foundation`
- **Spec:** [../spec.md](../spec.md)
- **Propósito:** verificar que la especificación es **completa, testeable y sin ambigüedad** antes de implementar, y servir de gate de aceptación al cerrar la fase.

Marca `[x]` solo con evidencia (comando + salida), no por impresión.

---

## A. Calidad de la especificación
- [ ] Cada requisito funcional (FR-001..FR-007) es **verificable** (tiene al menos un SC asociado).
- [ ] Cada Criterio de Éxito (SC-001..SC-009) es **medible con un comando**.
- [ ] No hay requisitos vagos ("rápido", "seguro") sin métrica.
- [ ] Los non-goals (spec §9) están explícitos y no se cuelan tareas de features de producto.
- [ ] Las preguntas abiertas del spec §11 están cerradas en [../research.md](../research.md).
- [ ] Cada decisión técnica de [../research.md](../research.md) lista alternativa descartada + racional.

## B. Objetivo 1 — "imposible de desordenar por accidente"
- [ ] `tsconfig` tiene `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. *(SC-001)*
- [ ] Aliases `@/modules`, `@/shared`, `@/config` declarados y funcionando.
- [ ] El linter **falla** si `**/domain/**` importa `next`/`@prisma/client`/`next-auth`. *(SC-002)*
- [ ] El linter **falla** ante *deep-imports* entre módulos (solo `index.ts` importable). *(SC-003, SC-009)*
- [ ] Existe test de arquitectura de respaldo (`tests/architecture/`) que replica la regla de dependencia.
- [ ] `env.ts` valida con Zod y el build **aborta** sin variable requerida. *(SC-004)*
- [ ] Los scripts de `package.json` hacen evidente el camino feliz (`setup`, `db:*`, `test`, `lint`, `typecheck`). *(NFR-006)*

## C. Objetivo 2 — "multitenancy desde el primer migrate"
- [ ] La **primera** migración crea `tenantId` en las tablas *scoped*. *(SC-005)*
- [ ] La primera migración habilita `ENABLE` **y** `FORCE ROW LEVEL SECURITY` + `CREATE POLICY`. *(SC-005)*
- [ ] La conexión de la app usa un rol **sin `BYPASSRLS`**. *(NFR-007)*
- [ ] El estado del schema deriva solo de migraciones; **no** hay script `db push`. *(SC-008)*
- [ ] `TenantContext` existe en `shared/application` y llega hasta el repositorio.
- [ ] Test de aislamiento: tenant B no ve datos del tenant A → **0 filas**. *(SC-006)*

## D. Primitivas y esqueleto
- [ ] `Result<T, E>` disponible en `shared/domain` y sin imports de framework/infra.
- [ ] `DomainError` base disponible y usado por al menos un error del módulo de ejemplo.
- [ ] Módulo `modules/example` con las 4 capas + `di.ts` + `index.ts`.
- [ ] `modules/example/index.ts` es la **única** superficie importable (verificado por lint). *(SC-009)*
- [ ] El repositorio del ejemplo aplica `SET LOCAL app.current_tenant` desde el `TenantContext`.

## E. Testing
- [ ] Vitest configurado; `vitest run` ejecutable.
- [ ] ≥ 1 **test de dominio** puro (sin DB, sin Next) en **verde**. *(SC-007)*
- [ ] El proyecto de dominio en Vitest no depende de infraestructura. *(NFR-005)*

## F. Cierre
- [ ] [../quickstart.md](../quickstart.md) recorrido end-to-end en limpio, cada comando confirmado.
- [ ] SC-001..SC-009 verdes y reproducibles.
- [ ] Estado del [../spec.md](../spec.md) actualizado a "Implementado".
