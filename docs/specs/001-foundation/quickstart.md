# Fase 1 — Quickstart

- **Feature:** `001-foundation`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Data model:** [data-model.md](data-model.md)

> Recorrido reproducible para levantar los rieles y **verificar cada Criterio de Éxito** con un comando. Al final, la Fase 1 está "hecha" si todo lo de §7 pasa.

---

## 0. Requisitos previos
- Node ≥ 20 LTS · `pnpm` · Docker Desktop.
- (Opcional para remoto) Cuenta de **Neon** con una base creada.

## 1. Instalar dependencias
```bash
pnpm install
```

## 2. Variables de entorno
Copiar el ejemplo y rellenar:
```bash
cp .env.example .env
```
`.env` (local con Docker):
```dotenv
NODE_ENV=development
AUTH_SECRET=<genera-uno: openssl rand -base64 32>
# App conecta con rol sin BYPASSRLS (ver data-model §3)
DATABASE_URL=postgresql://app_user:app_pw@localhost:5432/chartwise
# Conexión directa para migraciones (en local = misma URL con rol de migración/owner)
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/chartwise
```
Para remoto (Neon), usar la *pooled connection string* en `DATABASE_URL` y la *direct* en `DIRECT_URL`.

> **No** commitees `.env`. Solo `.env.example` (sin valores) va al repo.

## 3. Levantar Postgres local
```bash
pnpm db:up      # docker compose up -d postgres
```

## 4. Aplicar migraciones (con multitenancy + RLS)
```bash
pnpm db:migrate # prisma migrate dev
pnpm db:seed    # crea tenants A y B para el test de aislamiento
```
> ⛔ **Nunca** `prisma db push`. No existe script para ello a propósito (SC-008). Todo cambio de schema pasa por una migración versionada.

## 5. Verificaciones (mapa comando → Criterio de Éxito)

| # | Comando | Resultado esperado | SC |
|---|---|---|---|
| 1 | `pnpm typecheck` | Verde. Reintroducir un `arr[0].foo` sin guard → **error de tipo** | SC-001 |
| 2 | `pnpm lint` | Verde. Un import de `@prisma/client` dentro de `**/domain/**` → **falla** | SC-002 |
| 3 | `pnpm lint` | Un *deep-import* `@/modules/example/infrastructure/...` desde fuera → **falla** | SC-003, SC-009 |
| 4 | `AUTH_SECRET= pnpm build` | **Aborta** nombrando `AUTH_SECRET` | SC-004 |
| 5 | `pnpm prisma migrate status` | ≥ 1 migración; su SQL tiene `ENABLE/FORCE ROW LEVEL SECURITY` + `CREATE POLICY` | SC-005 |
| 6 | `pnpm test` | Test de aislamiento: tenant B lee `Note` de A → **0 filas** | SC-006 |
| 7 | `pnpm test` | Verde, con el test de dominio de `Note.create` pasando | SC-007 |
| 8 | `grep -R "db push" package.json` | **Sin coincidencias** | SC-008 |

## 6. Comandos de referencia (scripts de `package.json`)
```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "setup": "pnpm install && pnpm db:up && pnpm db:migrate && pnpm db:seed"
  }
}
```

## 7. Definición de "hecho" (Fase 1)
La fase está completa cuando:
- [ ] `pnpm typecheck` verde y SC-001 demostrado.
- [ ] `pnpm lint` verde y SC-002/SC-003/SC-009 demostrados.
- [ ] `pnpm build` aborta sin env requerida (SC-004).
- [ ] `prisma migrate status` ≥ 1 migración con RLS (SC-005) y sin `db push` (SC-008).
- [ ] `pnpm test` verde con test de dominio (SC-007) y test de aislamiento en 0 filas (SC-006).
- [ ] [checklists/requirements.md](checklists/requirements.md) al 100%.

## 8. Troubleshooting
- **`current_setting('app.current_tenant')` da error / ve todo** → la conexión usa un rol con `BYPASSRLS` (p. ej. `postgres`). La app debe usar `app_user` (`NOBYPASSRLS`) y la tabla `FORCE ROW LEVEL SECURITY` (ver [data-model.md](data-model.md) §3).
- **Migración falla en Neon** → asegúrate de usar `DIRECT_URL` (no la *pooled*) para migrar.
- **`env.ts` rompe el cliente** → falta `import "server-only"` o hay una variable sin prefijo `NEXT_PUBLIC_` usada en un componente cliente.
