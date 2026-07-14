# Fase 3 — Quickstart

- **Feature:** `003-roles-permissions`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Data model:** [data-model.md](data-model.md)

> Guía reproducible para verificar la fase. Todos los SC se comprueban con `vitest`/`grep`/`tsc`/`lint`/`prisma` — **sin E2E** (el repo no tiene runner). Los comandos usan los scripts existentes de `package.json`.

## 0. Requisitos previos
- Fase 1 y Fase 2 aplicadas (schema con `Tenant`/`User`/`Account`/`VerificationToken`, `app_user` `NOBYPASSRLS`, `EventBus`, `Result`/`DomainError`/`TenantContext`/`TenantId`).
- Postgres arriba: `pnpm db:up`.
- `.env` con `DATABASE_URL`/`DIRECT_URL` (rol `app_user`) y `AUTH_SECRET`.

## 1. Instalar dependencias
No hay dependencias nuevas: la autorización es dominio puro; `Membership` usa el Prisma ya instalado.
```bash
pnpm install
```

## 2. Migración de `Membership` + enum `Role`
```bash
pnpm prisma migrate dev --create-only --name add_membership_and_roles
# editar el SQL generado: GRANT a app_user + ENABLE/FORCE RLS + policies (scoped + por-usuario)
pnpm db:migrate
```

## 3. Verificaciones (mapa comando → Criterio de Éxito)

| # | Comando | Resultado esperado | SC |
|---|---|---|---|
| 1 | `pnpm lint` | **Falla** si `tenancy/domain/**` importa `next`/`@prisma/client`/`next-auth`/`@auth/*` | SC-001 |
| 2 | `pnpm test:unit -t "Role.create"` | `"OWNER"`→ok; `"root"`/`""`→`InvalidRoleError` | SC-002 |
| 3 | `pnpm test:unit -t "permission matrix"` | Matriz = §12.2 exacta (4×13); constante, no `async` | SC-003, SC-014 |
| 4 | `pnpm test:unit -t "can"` | `can("dataset:upload", viewer)`=false; `owner`=true; `dashboard:read` viewer=true | SC-004 |
| 5 | `pnpm test:unit -t "own"` | `dashboard:update` MEMBER dueño=true / ajeno=false / ADMIN=true | SC-005 |
| 6 | `pnpm test:unit -t "requirePermission"` | denegado→`Result.err(PermissionDeniedError)`; permitido→ok | SC-006 |
| 7 | `pnpm db:migrate && pnpm typecheck` | Crea enum `Role` + `Membership` (unique/índice) | SC-007 |
| 8 | `grep -R "ENABLE ROW LEVEL SECURITY\|GRANT" prisma/migrations` | RLS+GRANT sobre `memberships` | SC-007 |
| 9 | `pnpm test:integration -t "MembershipRepository"` | `create`/`findRole`/`listByUser` como `app_user` | SC-008 |
| 10 | `pnpm test:integration -t "membership isolation"` | tenant A leyendo `Membership` de B → **cero filas** | SC-009 |
| 11 | `pnpm typecheck` | Compila accediendo a `session.role`/`session.activeTenantId` poblados | SC-010 |
| 12 | `pnpm test:unit -t "provision workspace"` | `UserRegistered`→`Tenant`+`Membership(OWNER)`; fallo→nada | SC-011 |
| 13 | `pnpm test` (arquitectura) | **Falla** ante deep-import de `authorization/` o matriz en `src/config/**` | SC-012 |
| 14 | `pnpm test` (arquitectura) | **Falla** si `identity/**` importa `@/modules/tenancy` | SC-013 |

## 4. Prueba manual del flujo (opcional, no verifica SC)
1. `pnpm dev`, registrarse con un email nuevo.
2. El handler `ProvisionWorkspaceOnUserRegistered` crea el workspace personal + `Membership(OWNER)`.
3. Iniciar sesión; inspeccionar la sesión (o un `page.tsx` de prueba) → `session.role === "OWNER"`, `session.activeTenantId` poblado.

## 5. Comandos de referencia (scripts de package.json)
```bash
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint
pnpm test                 # vitest run (todos los proyectos)
pnpm test:unit            # vitest run --project unit
pnpm test:integration     # vitest run --project integration (Postgres real)
pnpm db:migrate           # prisma migrate dev
```

## 6. Definición de "hecho" (Fase 3)
- [ ] SC-001..SC-014 verdes y reproducibles.
- [ ] `Membership` + enum `Role` migrados con RLS+FORCE+GRANT y las dos policies.
- [ ] `session.role`/`activeTenantId` poblados sin que `identity` importe `tenancy`.
- [ ] **ADR-008** registrado en `../../spec.md §8`.
- [ ] `checklists/requirements.md` íntegramente marcado; `Estado` de `spec.md` = "Implementado".

## 7. Troubleshooting
- **`can()` compila pero devuelve `Promise`** → se coló un `async`; debe ser síncrona (SC-014).
- **La migración falla con "permission denied for table memberships"** → falta el `GRANT` a `app_user` en el SQL editado (SC-008).
- **`listByUser` devuelve cero filas para el propio usuario** → la policy por-usuario no está fijando `app.current_user` (R3/SC-009 mal calibrado).
- **`typecheck` rojo en `session.role`** → la augmentación sigue en `string`; estrechar a la unión literal de `Role` sin importar `tenancy` desde `identity` (R1/SC-010).
- **Test de arquitectura rojo tras Slice F** → `identity` está importando `tenancy`; mover la composición al composition root de `app/` (SC-013).
