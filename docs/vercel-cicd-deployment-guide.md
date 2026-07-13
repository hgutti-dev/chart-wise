# Guía de despliegue en Vercel con CI/CD (GitHub Actions) y validación con Docker

> **Para quién es esto:** un desarrollador Junior‑Mid que necesita desplegar `chart-wise`
> por primera vez y entender **por qué** se hace cada paso, no solo copiar comandos.
>
> **Regla de oro del repo:** la fuente de verdad es `docs/`, y el gestor de paquetes es
> **pnpm** (hay `pnpm-lock.yaml`; no uses `npm`/`yarn`). Todos los comandos de esta guía
> usan `pnpm`.

---

## Índice

1. [Introducción](#1-introducción)
2. [Arquitectura y diagnóstico actual](#2-arquitectura-y-diagnóstico-actual)
3. [Prerrequisitos](#3-prerrequisitos)
4. [Preparación del proyecto](#4-preparación-del-proyecto)
5. [Estrategia de ramas y flujo de trabajo](#5-estrategia-de-ramas-y-flujo-de-trabajo)
6. [Configuración de Docker para pruebas](#6-configuración-de-docker-para-pruebas)
7. [Estrategia de pruebas](#7-estrategia-de-pruebas)
8. [Configuración de Vercel](#8-configuración-de-vercel)
9. [Configuración de GitHub Actions](#9-configuración-de-github-actions)
10. [Secretos y variables de entorno](#10-secretos-y-variables-de-entorno)
11. [CI/CD propuesto](#11-cicd-propuesto)
12. [Validación posterior al despliegue](#12-validación-posterior-al-despliegue)
13. [Estrategia de rollback](#13-estrategia-de-rollback)
14. [Solución de problemas](#14-solución-de-problemas)
15. [Checklist final](#15-checklist-final)

Al final: [archivos creados/modificados](#archivos-creados-y-modificados),
[decisiones técnicas](#decisiones-técnicas-tomadas), [validación local exacta](#comandos-exactos-para-validar-localmente)
y [limitaciones pendientes](#limitaciones-y-riesgos-pendientes).

---

## 1. Introducción

`chart-wise` es una aplicación **Next.js 16** (App Router) multitenant. Esta guía describe cómo
llevarla a producción con un flujo **CI/CD** reproducible. Cada pieza tiene un papel claro:

- **Qué se despliega:** la app Next.js (páginas, Server Actions y route handlers de Auth.js),
  conectada a **PostgreSQL** con **Row‑Level Security (RLS)** y a **Google OAuth**.
- **Vercel** es la **plataforma de hosting y build de producción**. Construye la app de forma
  nativa (detecta Next.js), genera un **Preview** por cada Pull Request y un **Production**
  cuando se mergea a `master`. No usamos Dockerfile de producción: Vercel no lo necesita.
- **GitHub Actions** es el **motor de integración continua (CI)**: en cada PR corre lint,
  type‑check, tests y construye la app. Es el **guardián** (gate) que impide que código roto
  llegue a `master`.
- **Docker** se usa aquí para **validación reproducible**, no para desplegar. Concretamente,
  para correr las pruebas que necesitan una **base de datos real** (integración y aislamiento
  RLS) dentro de un contenedor, igual en tu máquina que en CI.
- **CI/CD en este proyecto** significa: *Continuous Integration* (validar automáticamente cada
  cambio) + *Continuous Deployment* (Vercel publica automáticamente lo que pasa el gate).

**Resultado final esperado:** abres un PR → GitHub Actions valida (incluida la prueba de
aislamiento multitenant) → Vercel publica un Preview navegable → al aprobar y mergear, Vercel
publica Production y un job aplica las migraciones de base de datos de forma controlada.

> **Todo con plan gratuito.** Este flujo funciona **sin pagar nada** y con el gate de `master`
> **obligatorio**: el repositorio es **público en GitHub Free**, lo que habilita **branch protection
> aplicada de verdad** y **GitHub Actions ilimitado**. Se suman **Vercel Hobby** (gratis, uso
> personal/no comercial), **Neon** (free tier) y **Google OAuth** (gratis). Contrapartida de ser
> público: el **código y el historial de git quedan visibles** para cualquiera (verifica que no se
> haya commiteado ningún secreto). Si prefieres mantenerlo **privado**, sigue siendo gratis pero el
> gate pasa a **informativo** (branch protection y Environments no se aplican en repos privados
> Free); ver la alternativa en §5.

---

## 2. Arquitectura y diagnóstico actual

### Stack tecnológico encontrado

| Área | Detalle (real, verificado en el repo) |
|---|---|
| **Framework** | Next.js **16.2.10** (App Router, RSC) + React **19.2.4** |
| **Lenguaje** | TypeScript **5** en modo estricto (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) |
| **Gestor de paquetes** | **pnpm 11.10.0** (fijado en `package.json → packageManager`; `pnpm-lock.yaml` con `lockfileVersion: '9.0'`) |
| **Node.js** | **>= 20** (`engines.node` en `package.json`, y `.nvmrc` = `20`) |
| **Estilos/UI** | Tailwind **v4** (CSS-first, sin `tailwind.config`), shadcn `base-nova` sobre `@base-ui/react` |
| **Pruebas** | **Vitest 4**, dos proyectos: `unit` (sin DB) e `integration` (con Postgres) |
| **ORM** | **Prisma 7** con driver adapter `@prisma/adapter-pg`; cliente generado en `src/generated/prisma` |
| **Base de datos** | PostgreSQL 16 (local por Docker; en producción se asume **Neon**) con **RLS** |
| **Auth** | **Auth.js v5** (`next-auth@5.0.0-beta.31`): Credentials + Google OAuth |
| **Lint** | ESLint 9 (flat config) con `eslint-plugin-boundaries` (arquitectura hexagonal por capas) |

### Versión recomendada de Node.js

**Node 24 LTS** (coincide con `.nvmrc` y `engines`). Úsala en local, en CI y en Vercel para
evitar diferencias sutiles de runtime. En Vercel se selecciona en *Project Settings → Node.js
Version*.

### Estrategia de build

- **Producción (Vercel):** `next build` nativo. **No** hay `output: "export"` ni `output:
  "standalone"` en `next.config.ts`; es un build estándar de Next.js servido por Vercel.
- **Gotcha crítico de build (fail‑fast):** `next.config.ts` importa `parseEnv()` y lo ejecuta
  **al cargar la config**. Es decir, `next build` **aborta** si falta alguna variable
  requerida (`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`,
  `DIRECT_URL`). Esto es deseado (falla temprano, no en producción a las 3 a. m.), pero implica
  que **esas variables deben existir en tiempo de build** en Vercel y en CI.

### Sistema de pruebas

Vitest con dos proyectos (`vitest.config.ts`):

- `unit` → `tests/unit/**` + `tests/architecture/**`. **No necesitan DB ni red.**
- `integration` → `tests/integration/**` + `tests/isolation/**`. **Requieren un Postgres vivo**
  con migraciones y seed aplicados. Incluyen la prueba **bloqueante** de aislamiento
  multitenant (una lectura cruzada entre tenants debe devolver **cero filas**).

Convención de nombres: los tests son `*.spec.ts` (no `*.test.ts`).

### Uso de Docker

Hoy solo existe `docker-compose.yml`, que levanta un **Postgres 16 local** para desarrollo y
tests (`pnpm db:up`). **No hay Dockerfile** de aplicación. Esta guía **añade** un arnés de
Docker *solo para validación* (ver §6).

### Dependencias externas

| Servicio | Estado | Rol |
|---|---|---|
| **PostgreSQL** | **Activo** | Datastore multitenant (RLS). Local = Docker; producción = Neon. |
| **Google OAuth** | **Activo** | Proveedor de login (Auth.js). Requiere un OAuth Client en Google Cloud. |
| **Microservicio FastAPI (analítica)** | *Especificado, no implementado* | Recibirá datasets y devolverá resultados por webhook. **Aún sin variables ni código.** |
| **Email / SMTP** | *Especificado, no implementado* | Envío de emails de verificación (hoy hay un `FakeEmailSender`). |
| **Object storage (S3/R2)** | *Implícito, no implementado* | Subida de datasets. |

> Los tres últimos se documentan como **“cableado futuro”**: no inventes secretos ni URLs para
> ellos todavía.

### Variables de entorno

La fuente de verdad es `src/config/env.schema.ts` (validación Zod) y `.env.example`. Detalle
completo en §10. Resumen: **5 requeridas** (`AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `DIRECT_URL`) y **2 con default** (`NODE_ENV`, `APP_URL`).

### Base de datos, ORM y migraciones

- **Prisma 7** separa la conexión en dos URLs *por diseño*:
  - `DATABASE_URL` → runtime de la app, con el **rol `app_user` (NOBYPASSRLS)** vía
    `@prisma/adapter-pg`. En Neon, la cadena **pooled**.
  - `DIRECT_URL` → CLI/migraciones (owner), configurada en `prisma.config.ts`
    (`datasource.url = env("DIRECT_URL")`). En Neon, la cadena **direct**.
- El cliente Prisma se genera en `src/generated/prisma`, que está **en `.gitignore`**.
- Migraciones versionadas en `prisma/migrations/` (3 migraciones). El SQL de RLS está
  **editado a mano** (crea el rol `app_user`, hace `ENABLE`/`FORCE ROW LEVEL SECURITY` y una
  policy `tenant_isolation`). Prisma no modela RLS; por eso la migración lleva ese SQL.
- **Regla dura:** solo `prisma migrate dev` (local) / `prisma migrate deploy` (CI/prod).
  **Nunca `db push`.**

### Riesgos o bloqueos detectados antes del despliegue

1. **`prisma generate` no corre solo.** El cliente está gitignoreado y no había `postinstall`.
   Sin generarlo, el build falla con imports de `@/generated/prisma`. → **Resuelto** con
   `postinstall: prisma generate` (ver §4).
2. **`prisma generate` necesita `DIRECT_URL`.** En Prisma 7, `prisma.config.ts` evalúa
   `env("DIRECT_URL")` al cargar y **lanza** si falta (aunque `generate` no se conecte). Por eso
   la variable debe estar en build/install de Vercel/CI/Docker.
3. **`next build` es fail‑fast** con las 5 variables requeridas (ver arriba).
4. **`pnpm test` incluye integración+aislamiento** que exigen Postgres. → Añadimos scripts
   separados `test:unit` / `test:integration` (ver §4 y §7).
5. **RLS en producción (Neon):** el rol `app_user` y sus permisos se crean en la migración con
   una password *fixture* local (`app_pw`). En Neon **debes provisionar/ajustar el rol y su
   credencial** y usar esa credencial en `DATABASE_URL` (ver §8).

### Estado actual del proyecto

| Elemento | ¿Existe? | Acción |
|---|---|---|
| `docker-compose.yml` (Postgres local) | ✅ Sí | Se reutiliza tal cual |
| `prisma/schema.prisma` + migraciones | ✅ Sí | Se reutiliza |
| `vitest.config.ts` (proyectos unit/integration) | ✅ Sí | Se reutiliza |
| `src/config/env.schema.ts` (Zod, fail-fast) | ✅ Sí | Se reutiliza |
| `.env.example` | ✅ Sí | Se reutiliza como plantilla |
| `Dockerfile` / `Dockerfile.test` | ❌ No | **Creado** `Dockerfile.test` (validación) |
| `docker-compose.test.yml` | ❌ No | **Creado** |
| `.dockerignore` | ❌ No | **Creado** |
| `.env.test` | ❌ No | **Creado** (valores dummy, versionado) |
| `.github/workflows/*` | ❌ No | **Creados** `ci.yml`, `migrate-production.yml`, `smoke.yml` |
| `vercel.json` | ❌ No | *No hace falta* (config por dashboard) |
| `postinstall` / scripts de test separados | ❌ No | **Añadidos** a `package.json` |

---

## 3. Prerrequisitos

- **Cuenta de GitHub** (el plan **Free** basta) con permiso de administrador en el repositorio y el
  repo en **público** (para que branch protection se **aplique** y Actions sea **ilimitado**; ver
  §5). *(En privado + Free branch protection y Environments no se aplican — alternativa en §5.)*
- **Cuenta de Vercel** (plan **Hobby**, gratis para uso personal/no comercial) con permiso para importar el repo.
- **Repositorio remoto** en GitHub con la rama `master`.
- **Docker** instalado y corriendo (Docker Desktop en Windows/Mac). Necesario para las pruebas
  con DB en local y para reproducir el job `docker-validate`.
- **Node.js 24+** y **pnpm 11.10.0** en local:
  ```bash
  node -v            # v24.x o superior (engines pide >=24)
  corepack enable    # habilita pnpm; usará la versión de `packageManager` en package.json
  pnpm -v            # 11.10.0 (la versión fijada en packageManager)
  ```
  > La versión de pnpm es **única fuente de verdad** en `package.json → packageManager`
  > (`pnpm@11.10.0`). En local, con corepack habilitado, pnpm se ajusta a esa versión; CI y
  > Docker la leen del mismo campo, así todos los entornos usan exactamente la misma versión.
  > Se usa **pnpm 11.x** porque el proyecto fija **Node 24** (pnpm 11 exige Node ≥ 22.13).
- **Vercel CLI:** **no es imprescindible** con el modelo elegido (Vercel despliega vía Git).
  Solo lo necesitarás para depurar builds en local (`vercel build`). Instálalo únicamente si te
  hace falta: `pnpm add -g vercel`.
- **Acceso a los servicios externos (todos con capa gratuita):**
  - **PostgreSQL de producción** (recomendado: **Neon**, cuyo **free tier** basta para empezar) con
    dos cadenas de conexión (pooled y direct) y capacidad de crear/ajustar el rol `app_user`.
  - **Google Cloud OAuth Client** (Web application, gratis) con el redirect URI de tu dominio.
- **Permisos:**
  - GitHub: *Settings → Branches* (branch protection) y *Settings → Secrets and variables → Actions*
    (repository secrets). *(En repos públicos Free ambas se aplican; en privados Free no — ver §5.)*
  - Vercel: acceso a *Project → Settings → Environment Variables* y *Git*.

---

## 4. Preparación del proyecto

Antes de tocar CI/CD, deja el proyecto **verde en local**. Cada comando explica qué hace, por
qué, qué esperar y qué suele fallar.

> **Cambio de configuración aplicado** (mínimo e imprescindible). En `package.json` se añadieron:
> ```jsonc
> "postinstall": "prisma generate",                        // genera el cliente gitignoreado
> "test:unit": "vitest run --project unit",                 // tests sin DB (gate rápido)
> "test:integration": "vitest run --project integration"    // tests con DB (RLS)
> ```

### 4.1 Instalar dependencias

```bash
pnpm install --frozen-lockfile
```
- **Qué hace:** instala exactamente lo que fija `pnpm-lock.yaml` y ejecuta `postinstall`
  (`prisma generate`).
- **Por qué:** `--frozen-lockfile` garantiza instalación **reproducible** (falla si el lockfile
  no está sincronizado), igual que en CI.
- **Resultado esperado:** termina sin errores y aparece `src/generated/prisma/` (cliente Prisma).
- **Errores frecuentes:**
  - `PrismaConfigEnvError: DIRECT_URL` → no tienes `.env`. Copia `.env.example` a `.env` y
    rellena `DIRECT_URL` (basta una URL válida para generar; ver §10).
  - `ERR_PNPM_OUTDATED_LOCKFILE` → alguien cambió `package.json` sin actualizar el lockfile;
    corre `pnpm install` (sin `--frozen-lockfile`) y commitea el lockfile.

### 4.2 Comprobar el proyecto localmente (DB + migraciones + seed)

```bash
pnpm db:up        # levanta Postgres 16 en Docker (docker compose up -d postgres)
pnpm db:migrate   # prisma migrate dev: aplica migraciones (crea tablas, rol app_user y RLS)
pnpm db:seed      # prisma db seed: inserta los tenants A y B (fixture del test de aislamiento)
```
- **Por qué:** los tests de integración/aislamiento necesitan una DB con esquema, RLS y datos.
- **Resultado esperado:** `db:seed` imprime `Seed OK: 2 tenants (tenant-a, tenant-b).`
- **Errores frecuentes (Windows):** si ya tienes un Postgres nativo en el puerto 5432, choca con
  el contenedor. Define `DB_HOST_PORT=5433` en `.env` y ajusta el puerto en `DATABASE_URL` /
  `DIRECT_URL`.

### 4.3 Lint

```bash
pnpm lint
```
- **Qué hace:** ESLint con las reglas de frontera (`eslint-plugin-boundaries`) que hacen cumplir
  la arquitectura (dependencias apuntan hacia dentro; sin deep-imports entre módulos).
- **Resultado esperado:** *0 problemas*.
- **Errores frecuentes:** un import que cruza capas o hace deep-import de otro módulo → respeta la
  API pública (`@/modules/<módulo>`).

### 4.4 Validación de tipos

```bash
pnpm typecheck
```
- **Qué hace:** `tsc --noEmit` con TypeScript estricto.
- **Resultado esperado:** sin salida y código de salida 0.
- **Errores frecuentes:** `noUncheckedIndexedAccess` obliga a manejar `undefined` en accesos por
  índice; no lo silencies con `!` a la ligera.

### 4.5 Pruebas

```bash
pnpm test:unit          # rápido, sin DB (unit + architecture)
pnpm test:integration   # requiere la DB de 4.2 arriba (integration + isolation)
```
- **Por qué separadas:** el gate de PR corre `test:unit` (rápido). Las de integración/aislamiento
  necesitan Postgres y se corren aparte (o en Docker, §6).
- **Resultado esperado:** todo en verde; en especial *“tenant B no ve la Note del tenant A →
  cero filas”*.
- **Errores frecuentes:** `DATABASE_URL no está definida` → no levantaste la DB o falta `.env`.

### 4.6 Build de producción

```bash
pnpm build
```
- **Qué hace:** `next build`. Antes de compilar, `parseEnv()` valida las variables.
- **Resultado esperado:** build exitoso; genera `.next/`.
- **Errores frecuentes:** `Variables de entorno inválidas o ausentes` → falta una de las 5
  requeridas en tu `.env`. El mensaje dice cuál.

### 4.7 Comprobar variables de entorno

```bash
# PowerShell (Windows): compara tus claves contra la plantilla
Get-Content .env.example | Select-String '^\w' 
```
- **Por qué:** detectar variables faltantes **antes** de configurar CI/CD ahorra depurar builds
  rojos en Vercel.
- **Resultado esperado:** tu `.env` tiene, como mínimo, las 5 requeridas con valores válidos.

---

## 5. Estrategia de ramas y flujo de trabajo

Mantenemos algo **simple y mantenible**, acorde al tamaño del proyecto (un solo servicio):

- **`master`** = rama de **producción**, **protegida** (branch protection aplicada). Cada merge
  dispara Production en Vercel.
- **Ramas de funcionalidad** (`feat/...`, `fix/...`, `docs/...`) desde `master`.
- **Pull Request** hacia `master` por cada cambio. Vercel publica un **Preview** por PR.
- **Sin rama de integración** (`develop`): añadiría complejidad sin beneficio aquí. Se documenta
  como alternativa si el equipo crece.
- **Revisión de código:** ≥1 aprobación si trabajas en equipo (ver la nota para dev en solitario).

### Protección de `master` (branch protection obligatoria)

> **Requisito para que se aplique gratis:** el repo debe ser **público**. En repos públicos, GitHub
> **Free** ya **hace cumplir** branch protection (la pantalla lo confirma: *"can only enforce rules
> on its public repositories, like this one"*) y **Actions es ilimitado**. *(Si necesitas mantenerlo
> privado y gratis, ver «Alternativa: repo privado» al final de la sección — el gate pasa a
> informativo.)*

En *GitHub → Settings → Branches → Add branch protection rule*:

1. **Branch name pattern:** `master`.
2. ✅ **Require a pull request before merging.**
   - *Require approvals:* **1** en equipo. **Si trabajas solo, ponlo en `0`**: GitHub no permite
     aprobar tu propio PR, así que con 1 aprobación + «no bypass» **te quedas sin poder mergear**.
     Con `0` el gate real siguen siendo los checks del CI.
3. ✅ **Require status checks to pass before merging** → añade los dos checks:
   - **`Lint · Typecheck · Unit · Build`** (job `quality`)
   - **`Docker · Integration & Isolation (RLS)`** (job `docker-validate`)
   - ⚠️ **Solo aparecen tras su primera ejecución.** Si el buscador está vacío, abre un PR de
     prueba, deja correr `ci.yml`, y vuelve a esta pantalla a añadirlos.
   - Marca la sub-casilla **Require branches to be up to date before merging**.
4. ✅ **Do not allow bypassing the above settings** (aplica las reglas también a administradores).

Deja **sin marcar** el resto (Require conversation resolution, Require signed commits, Require
linear history, Require deployments to succeed, Lock branch, Allow force pushes, Allow deletions):
no hacen falta para este flujo.

> **Por qué importa con Vercel Git nativo:** Vercel despliega Production a partir de lo que hay en
> `master`. Al **exigir** que el CI esté verde para poder mergear, garantizas que **a `master` solo
> entra código validado**, y por tanto Production nunca recibe algo que no pasó el gate. Los Preview
> de ramas de PR sí se despliegan aunque el CI esté rojo (son desechables y útiles para revisar).

<details>
<summary><strong>Alternativa: repo privado (gratis, pero gate <em>informativo</em>)</strong></summary>

Si prefieres no exponer el código, mantén el repo **privado**. En **GitHub Free**, sin embargo,
branch protection / rulesets / Environments **no se aplican** en repos privados (GitHub avisa:
*"won't be enforced on this private repository…"*). El gate de `master` pasa a ser **informativo**:

- `ci.yml` corre igual en cada PR y publica los mismos dos checks; los ves en rojo/verde.
- **Regla de oro (manual):** *no se mergea un PR con algún check en rojo* — GitHub **no lo impide**,
  depende de la disciplina del equipo.
- Para volverlo obligatorio **sin** exponer el código necesitarías un plan de pago: **GitHub Pro**
  (~4 USD/mes, cuenta personal) o una **organización con Team**.
</details>

---

## 6. Configuración de Docker para pruebas

Docker aquí es un **arnés de validación reproducible**, no un artefacto de despliegue. Reutiliza
el `docker-compose.yml` existente solo como referencia del Postgres; para CI usamos archivos
nuevos y aislados.

### Archivos creados

- **`.dockerignore`** — mantiene el contexto de build liviano y **evita filtrar secretos**
  (`.env*`, `.git`, `node_modules`, `src/generated`, etc.).
- **`Dockerfile.test`** — imagen basada en `node:24-slim` con **pnpm 11.10.0** (instalado por npm,
  fijado a `packageManager`). Instala dependencias (dispara `postinstall → prisma
  generate`) y copia el código. **No** construye Next.js: su fin es correr pruebas.
- **`docker-compose.test.yml`** — orquesta un **Postgres efímero** + un contenedor `app-test`
  que aplica migraciones, siembra y corre `test:integration`.

`Dockerfile.test`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# pnpm FIJADO a la misma versión que `packageManager`. Node 24 permite pnpm 11.x
# (pnpm 11 exige Node >=22.13). Se instala por npm (determinista).
RUN npm install -g pnpm@11.10.0

WORKDIR /app

# Placeholder SOLO para que el postinstall (prisma generate) no falle: en Prisma 7,
# prisma.config.ts evalúa env("DIRECT_URL") al cargar. `generate` no se conecta a la DB.
# En runtime, docker-compose pisa estos valores con los reales del Postgres de test.
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["pnpm", "test:integration"]
```

`docker-compose.test.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: chartwise-postgres-test
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: chartwise
    ports:
      - "${DB_TEST_HOST_PORT:-5433}:5432"
    tmpfs:
      - /var/lib/postgresql/data     # DB en memoria: rápida y sin residuos
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d chartwise"]
      interval: 5s
      timeout: 5s
      retries: 10

  app-test:
    build:
      context: .
      dockerfile: Dockerfile.test
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env.test
    environment:
      DIRECT_URL: "postgresql://postgres:postgres@postgres:5432/chartwise"
      DATABASE_URL: "postgresql://app_user:app_pw@postgres:5432/chartwise"
    restart: "no"
    command:
      - sh
      - -c
      - |
        set -e
        pnpm exec prisma migrate deploy
        pnpm exec prisma db seed
        pnpm test:integration
```

### Cómo construir y ejecutar

```bash
# Construye la imagen, levanta Postgres, migra + siembra + corre integration/isolation.
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from app-test
```
- **Qué hace:** `--exit-code-from app-test` propaga el resultado de las pruebas como código de
  salida (0 = todo verde). `--abort-on-container-exit` detiene el stack cuando `app-test` termina.
- **Cómo pasar variables de prueba:** vienen de `.env.test` (valores dummy versionados) y el
  propio compose sobrescribe las URLs de DB para apuntar al servicio `postgres` de la red interna.
  **Prioridad:** `environment` (compose) > `env_file` (`.env.test`).
- **Servicios auxiliares (la DB):** el servicio `postgres` es efímero (`tmpfs`), así cada corrida
  parte de cero, evitando falsos verdes por datos residuales.

### Limpieza

```bash
docker compose -f docker-compose.test.yml down -v   # borra contenedores, red y volúmenes
docker image prune -f                               # (opcional) limpia imágenes colgadas
```

### Buenas prácticas aplicadas

- **Sin secretos en la imagen:** el `.dockerignore` excluye `.env*`; el entorno real llega por
  `env_file`/`environment` en runtime, nunca horneado en una capa.
- **Caché de Docker:** primero se copian `package.json` + lockfile (+ `prisma/`), luego se
  instala y **después** se copia el resto del código. Así, si solo cambia el código, la capa de
  dependencias se reutiliza y el build es mucho más rápido.

---

## 7. Estrategia de pruebas

Niveles de validación, de más barato a más caro:

| Nivel | Comando | ¿DB? | Dónde corre |
|---|---|---|---|
| Instalación reproducible | `pnpm install --frozen-lockfile` | No | Local, CI, Docker |
| Lint (incluye fronteras de arquitectura) | `pnpm lint` | No | Local, CI |
| Type-check | `pnpm typecheck` | No | Local, CI |
| **Unit + architecture** | `pnpm test:unit` | No | Local, CI (job `quality`) |
| **Integración + aislamiento (RLS)** | `pnpm test:integration` | **Sí** | Local (con `db:up`), Docker, CI (job `docker-validate`) |
| Build de producción | `pnpm build` | No | Local, CI, Vercel |
| Imagen Docker + tests en contenedor | `docker compose -f docker-compose.test.yml up …` | Sí | Local, CI |

> **Formato:** no hay herramienta de *formatting* dedicada (Prettier) en el repo. El estilo lo
> cubre ESLint. No inventamos un paso de `format`.

### Diferencias por entorno (importante)

- **Local:** puedes correr todo. Las integración/aislamiento requieren `pnpm db:up` + migrate +
  seed (o usar el compose de test).
- **GitHub Actions:** el job `quality` corre lint/type/unit/build sin DB; el job
  `docker-validate` corre integración/aislamiento **dentro de Docker** con su propio Postgres.
- **Docker:** encapsula la DB + migraciones + seed + `test:integration` de forma reproducible.
- **Vercel:** **no ejecuta tu suite de tests.** Solo hace `install` + `build`. La validación de
  correctitud es responsabilidad de GitHub Actions; Vercel valida que **compile y despliegue**.

### Cobertura actual (honesto, sin inventar)

- **Sí existen:** 26 specs de Vitest (dominio, casos de uso de `identity`, arquitectura,
  integración de repositorios y **aislamiento RLS**).
- **No existen:** pruebas **E2E** (Playwright no está instalado). No las inventamos. Si en el
  futuro se añaden, el sitio natural es un job E2E separado contra el Preview de Vercel; hoy
  la verificación post-deploy es el *smoke test* de §12.

---

## 8. Configuración de Vercel

### 8.1 Conectar el repositorio

1. En Vercel: *Add New… → Project → Import Git Repository* y elige el repo de GitHub.
2. **Framework Preset:** Vercel detectará **Next.js** automáticamente. Déjalo así.
3. **Root Directory:** `.` (la raíz). *No es un monorepo*; no cambies esto.
4. **Node.js Version:** **24.x** (Project Settings → General). Si Vercel aún no lista 24.x, usa **22.x** (también cumple el mínimo de pnpm 11) y relaja `engines` a `>=22`.

### 8.2 Comandos de build

Con este proyecto, los **valores por defecto de Vercel funcionan**, pero conviene fijarlos
explícitamente (*Project Settings → Build & Development Settings*):

| Ajuste | Valor | Por qué |
|---|---|---|
| **Install Command** | `pnpm install --frozen-lockfile` | Instalación reproducible; dispara `postinstall` (`prisma generate`). |
| **Build Command** | `pnpm build` *(o dejar el default `next build`)* | Build estándar de Next. |
| **Output Directory** | *(vacío / default)* | Next.js gestiona su salida; no la fuerces. |

> **`prisma generate` en Vercel:** al correr `postinstall`, el cliente se genera durante el
> install. Si alguna vez Vercel cachea dependencias y **omite** el postinstall (síntoma: error
> `@prisma/client did not initialize` en runtime), el *fallback* es poner el Build Command como
> `prisma generate && next build`.

### 8.3 Variables de entorno (Development / Preview / Production)

En *Project Settings → Environment Variables* añade las **5 requeridas** (y `APP_URL`). Vercel
distingue tres entornos:

- **Production:** valores reales de producción (DB de prod, OAuth de prod).
- **Preview:** valores para los despliegues de PR. Idealmente una **DB de staging** distinta a
  producción, para que un Preview nunca escriba en datos reales.
- **Development:** los usa `vercel dev` en local (opcional).

> **Fail‑fast:** como `next build` valida el entorno, si olvidas una variable en Preview o
> Production, **el build de Vercel fallará** indicando cuál falta. Es una red de seguridad, no un
> bug.

`APP_URL` debe apuntar al **dominio real** de cada entorno (p. ej. `https://chart-wise.vercel.app`
en Production), porque es la base de los enlaces de verificación de email.

### 8.4 Entornos, Preview Deployments y dominio

- **Preview Deployments:** Vercel crea una URL única por cada push a una rama con PR. Úsala para
  revisar visualmente antes de aprobar.
- **Production:** se publica al mergear a `master`.
- **Dominio de producción:** *Project Settings → Domains*. Empieza con el dominio
  `*.vercel.app`; añade tu dominio propio cuando lo tengas y **actualiza `APP_URL`** y el
  **redirect URI de Google** en consecuencia.

### 8.5 Logs

- **Build logs:** en cada deployment, pestaña *Building*. Aquí verás fallos de `parseEnv`,
  `prisma generate`, etc.
- **Runtime logs:** *Project → Logs* (o *Observability*). Aquí verás errores de conexión a la DB
  o de Auth.js en ejecución.

### 8.6 Impedir secretos en el repo

- Nunca commitees `.env` (ya está en `.gitignore`). Los secretos viven **solo** en Vercel
  (Environment Variables) y en GitHub (Secrets). `.env.test` sí se versiona porque **solo tiene
  valores dummy**.

### 8.7 Base de datos en Vercel (Neon) — puntos clave

- **URL de conexión:**
  - `DATABASE_URL` = cadena **pooled** de Neon, usando el **rol `app_user`** (NOBYPASSRLS).
  - `DIRECT_URL` = cadena **direct** de Neon, usando el **rol owner** (para migraciones/DDL).
- **Provisión del rol `app_user`:** la migración crea `app_user` con la password *fixture*
  `app_pw`, pensada para local. En Neon debes **crear/ajustar** ese rol con una **password
  propia y segura** y sus `GRANT`s, y usar esa credencial en `DATABASE_URL`. (Ejecuta el bloque
  de rol/grants una vez desde un cliente SQL conectado como owner, o adáptalo a la gestión de
  roles de Neon.)
- **Migraciones:** se aplican con `prisma migrate deploy` desde **GitHub Actions**
  (`migrate-production.yml`), **no** desde el build de Vercel (ver §9 y el recuadro de riesgo).
- **Generación del cliente ORM:** vía `postinstall` en cada build (§8.2).
- **Conexiones desde funciones serverless:** usa la cadena **pooled** en `DATABASE_URL` para no
  agotar conexiones (Neon ofrece un pooler; Vercel escala funciones y abre muchas conexiones).
- **Riesgo de migrar en cada deploy (por qué NO lo hacemos en el build):**

> ⚠️ **No ejecutes `prisma migrate deploy` dentro del build de Vercel.** Cada build (incluidos
> **todos** los Preview) lo dispararía; varias migraciones podrían correr en paralelo sobre la
> misma DB y una migración a medias puede romper producción. Además, un Preview no debe tocar el
> esquema de producción. Por eso las migraciones van en un **job dedicado y serial** de Actions.

---

## 9. Configuración de GitHub Actions

Con el modelo **Vercel Git nativo + CI como gate**, Actions **no despliega** (eso lo hace
Vercel). Actions **valida** y **migra**. Creamos tres workflows en `.github/workflows/`.

> **Por qué no un workflow de deploy con Vercel CLI:** duplicaría el despliegue nativo de Vercel
> (lo que queremos evitar) y obligaría a guardar `VERCEL_TOKEN/ORG_ID/PROJECT_ID`. Se menciona
> como alternativa en [Decisiones técnicas](#decisiones-técnicas-tomadas).

Todos aplican **privilegio mínimo** (`permissions: contents: read`), **`concurrency`**,
**timeouts** y **caché de pnpm**.

### 9.1 `ci.yml` — gate de PR y push a master

```yaml
name: CI

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality:
    name: Lint · Typecheck · Unit · Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      AUTH_SECRET: ci-dummy-secret
      AUTH_GOOGLE_ID: ci-dummy-google-id
      AUTH_GOOGLE_SECRET: ci-dummy-google-secret
      DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
      DIRECT_URL: postgresql://ci:ci@localhost:5432/ci
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4    # versión leída de packageManager (package.json)
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile   # postinstall → prisma generate
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm build

  docker-validate:
    name: Docker · Integration & Isolation (RLS)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - name: Integration & isolation tests in Docker
        run: >
          docker compose -f docker-compose.test.yml up
          --build --abort-on-container-exit --exit-code-from app-test
      - name: Tear down
        if: always()
        run: docker compose -f docker-compose.test.yml down -v
```

- **Variables dummy en `quality`:** `next build` y `prisma generate` las exigen (fail‑fast). **No
  son secretos**; son placeholders válidos y el build no se conecta a la DB.
- **`docker-validate`:** corre las pruebas con DB **dentro de Docker**, reutilizando exactamente
  el mismo arnés que en local → *“funciona en mi máquina” deja de ser una excusa*.

### 9.2 `migrate-production.yml` — migraciones controladas

```yaml
name: Migrate Production DB

# Trigger SOLO manual: lo ejecutas a mano desde la pestaña Actions. En Free, esto sustituye al
# "required reviewer" (no disponible en repos privados Free): tú eres la aprobación humana antes
# de tocar la DB. Cuando haya DB de producción puedes re-habilitar `push: branches: [master]`.
on:
  workflow_dispatch: {}

concurrency:
  group: migrate-production
  cancel-in-progress: false     # nunca canceles una migración a medias

permissions:
  contents: read

jobs:
  migrate:
    name: prisma migrate deploy
    runs-on: ubuntu-latest
    timeout-minutes: 10
    # DIRECT_URL = repository secret (simple y válido en cualquier plan; ver nota bajo el YAML).
    env:
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4    # versión leída de packageManager (package.json)
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec prisma migrate deploy
```

- **`DIRECT_URL` como *repository secret*:** en *Settings → Secrets and variables → Actions → New
  repository secret* añade `DIRECT_URL` (cadena directa/owner de Neon). Es la opción **simple y que
  funciona en cualquier plan**; por eso el workflow **no** declara `environment: production`. El
  *trigger manual* (`workflow_dispatch`) hace de aprobación humana antes de migrar.
  - *Opcional (repo público):* en repos públicos los **Environments** de Free **sí** se aplican, así
    que puedes crear un Environment `production` con **required reviewers** y mover ahí el secret,
    para una **aprobación formal** antes de tocar la DB. No es necesario.
- **`concurrency` serial:** evita dos migraciones simultáneas.

> ⚠️ **Limitación honesta (orden migrate ↔ deploy):** al mergear, este job y el deploy de Vercel
> corren **en paralelo**; Vercel no espera a Actions. Para que no haya ventana de incompatibilidad
> usa **migraciones expand‑contract (backward‑compatible)**: primero despliega esquema que el
> código viejo y el nuevo toleran, y elimina lo viejo en un cambio posterior. Si necesitas orden
> estricto, cambia al modelo *“deploy desde Actions”* (ver Decisiones técnicas).

### 9.3 `smoke.yml` — verificación post-deploy (opcional)

```yaml
name: Smoke (post-deploy)

on:
  deployment_status

permissions:
  contents: read

jobs:
  smoke:
    name: Curl rutas públicas
    runs-on: ubuntu-latest
    timeout-minutes: 5
    if: ${{ github.event.deployment_status.state == 'success' }}
    steps:
      - name: Smoke test main routes
        env:
          TARGET_URL: ${{ github.event.deployment_status.target_url }}
        run: |
          set -e
          curl -fsSL -o /dev/null -w "%{http_code}  /\n"                    "$TARGET_URL/"
          curl -fsSL -o /dev/null -w "%{http_code}  /login\n"              "$TARGET_URL/login"
          curl -fsSL -o /dev/null -w "%{http_code}  /api/auth/providers\n" "$TARGET_URL/api/auth/providers"
```

- Se dispara con el evento `deployment_status` que **emite Vercel** al terminar un deploy. Para
  limitarlo a Production añade `&& github.event.deployment_status.environment == 'Production'` al
  `if`.
- Es *best-effort*: si Vercel no está conectado vía la integración de GitHub Deployments, este
  evento no llega y el workflow simplemente no corre.

---

## 10. Secretos y variables de entorno

**Fuente de verdad:** `src/config/env.schema.ts` (Zod) y `.env.example`. Nunca escribas secretos
reales; usa placeholders.

| Variable | Descripción | Entorno | ¿Secreto? | Dónde configurarla | ¿Build / Runtime / Test? |
|---|---|---|---|---|---|
| `AUTH_SECRET` | Secreto de firma de sesión (Auth.js v5). Genera con `openssl rand -base64 32`. | Prod, Preview, (Local) | **Secreto** | Vercel (Prod+Preview), `.env` local | **Build** (fail-fast) + Runtime |
| `AUTH_GOOGLE_ID` | Client ID del OAuth de Google. | Prod, Preview, (Local) | Secreto (no `NEXT_PUBLIC_`) | Vercel, `.env` local | **Build** (fail-fast) + Runtime |
| `AUTH_GOOGLE_SECRET` | Client Secret del OAuth de Google. | Prod, Preview, (Local) | **Secreto** | Vercel, `.env` local | **Build** (fail-fast) + Runtime |
| `DATABASE_URL` | Conexión de la app (rol `app_user`, NOBYPASSRLS; en Neon, *pooled*). | Prod, Preview, Test | **Secreto** | Vercel, GitHub (test), `.env`/`.env.test` | Runtime + **Test** |
| `DIRECT_URL` | Conexión directa/owner para migraciones y `prisma generate`. | Prod (Actions), Test, Build | **Secreto** | GitHub **repository secret**, Vercel, `.env`/`.env.test` | **Build** (generate) + Migraciones + **Test** |
| `APP_URL` | Base pública para enlaces de verificación de email. Default `http://localhost:3000`. | Prod, Preview | Público (no `NEXT_PUBLIC_`) | Vercel | Runtime |
| `NODE_ENV` | `development` / `test` / `production`. | Todos | Público | Automático (Next/Vitest) | Build + Runtime + Test |
| `DB_HOST_PORT` | *(Opcional, solo local)* Puerto host del Postgres de Docker (default 5432). | Local | Público | `.env` | Solo local/Docker |

> **No hay variables `NEXT_PUBLIC_*`** en el proyecto. Cuando aparezca una variable de cliente,
> se prefijará `NEXT_PUBLIC_` explícitamente; hasta entonces, **todo es server-side**.

### Dónde va cada cosa (mapa mental)

| Archivo / lugar | Contenido | ¿Se versiona? |
|---|---|---|
| `.env.local` | *(No usado por este proyecto; usa `.env`.)* | — |
| `.env` | Secretos reales de tu máquina | ❌ No (gitignored) |
| `.env.test` | Valores **dummy** + DB de test | ✅ Sí (sin secretos) |
| `.env.example` | Plantilla de nombres, sin valores | ✅ Sí |
| **GitHub → Secrets and variables → Actions (repository secret)** | `DIRECT_URL` para migraciones | ❌ (cifrado) |
| **GitHub → Variables** | *(No hacen falta hoy; los dummy del CI van inline en `ci.yml`.)* | — |
| **Vercel → Environment Variables** | Las 5 requeridas + `APP_URL`, por entorno | ❌ (cifrado) |

### Ejemplo seguro (placeholders)

```bash
# .env  (NO commitear)
NODE_ENV=development
AUTH_SECRET=<<genera-con-openssl-rand-base64-32>>
AUTH_GOOGLE_ID=<<tu-google-client-id>>
AUTH_GOOGLE_SECRET=<<tu-google-client-secret>>
APP_URL=http://localhost:3000
DB_HOST_PORT=5432
DATABASE_URL=postgresql://app_user:app_pw@localhost:5432/chartwise
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/chartwise
```

---

## 11. CI/CD propuesto

Flujo completo, del branch a producción:

1. **Crear rama** desde `master` (`feat/mi-cambio`).
2. **Implementar** el cambio.
3. **Validar en local:** `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` y `pnpm build` (+
   `docker compose -f docker-compose.test.yml up …` si tocaste DB/repos). En **Windows
   PowerShell 5.1** ejecútalos **uno por línea** (ese shell no soporta `&&`); ver
   [nota de shell en §14](#diferencias-windows--linux--github-actions).
4. **Abrir Pull Request** hacia `master`.
5. **GitHub Actions** corre `ci.yml`: jobs `quality` y `docker-validate`.
6. **Docker** construye y corre integración/aislamiento dentro del job `docker-validate`.
7. **Vercel** publica un **Preview Deployment** para el PR.
8. **Revisar y aprobar** (revisión de código + revisar el Preview).
9. **Merge** a `master` (**solo posible con los dos checks en verde**, por branch protection en el
   repo público; ver §5).
10. **Pipeline de producción:** ejecutas `migrate-production.yml` **a mano** (*Actions → Run
    workflow*) para aplicar migraciones; Vercel construye Production en paralelo al merge.
11. **Vercel despliega** Production.
12. **Verificaciones post-deploy:** `smoke.yml` (automático) + smoke manual (§12).

```mermaid
flowchart TD
    A[Crear rama feat/*] --> B[Implementar cambio]
    B --> C["Validación local<br/>lint · typecheck · test:unit · build"]
    C --> D[Abrir Pull Request → master]

    D --> E{{GitHub Actions: ci.yml}}
    E --> E1[job quality<br/>lint · typecheck · test:unit · build]
    E --> E2[job docker-validate<br/>Docker: integration + isolation RLS]
    D --> F[Vercel: Preview Deployment]

    E1 --> G{Checks verdes?}
    E2 --> G
    G -- No --> B
    G -- Sí --> H[Revisión de código + revisar Preview]
    H --> I[Merge a master]

    I --> J{{Actions: migrate-production.yml<br/>prisma migrate deploy}}
    I --> K[Vercel: Production Deployment]
    J -. en paralelo .- K

    K --> L{{Actions: smoke.yml<br/>curl rutas públicas}}
    L --> M[Smoke manual + revisar logs]
    M --> N([Producción validada])
```

---

## 12. Validación posterior al despliegue

Tras un deploy de Production, confirma:

### Smoke tests automáticos

- `smoke.yml` (§9.3) hace `curl` a `/`, `/login` y `/api/auth/providers`. Si algo devuelve
  ≥ 400, el workflow falla y te avisa.

### Smoke tests manuales (checklist)

- [ ] **El dominio responde:** abre `https://<tu-dominio>` → carga sin error 500.
- [ ] **Rutas públicas:** `/login`, `/register`, `/verify-email` cargan (200).
- [ ] **Ruta protegida sin sesión:** `/profile` **redirige** a `/login?callbackUrl=/profile`
  (lo fuerza `src/proxy.ts`).
- [ ] **Autenticación:** inicia sesión con Google y con credenciales; tras login, `/profile`
  muestra tu perfil. *(Requiere el redirect URI correcto en Google Cloud para el dominio.)*
- [ ] **Variables de entorno presentes:** si faltara alguna requerida, el **build de Vercel ya
  habría fallado**; en runtime, un error de Auth.js suele indicar `AUTH_SECRET`/OAuth mal puestos.
- [ ] **Conexión a la base de datos:** un flujo que lea/escriba (login con credenciales) funciona
  → la DB responde y `DATABASE_URL`/rol `app_user` están bien.
- [ ] **Endpoints principales:** `/api/auth/providers` devuelve JSON con `google` y `credentials`.
- [ ] **Logs sin errores relevantes:** revisa *Vercel → Logs* (runtime) del deployment.
- [ ] **El build corresponde al commit esperado:** en *Vercel → Deployments*, el deployment de
  Production muestra el SHA de `master`; compáralo con `git rev-parse HEAD`.

### Comprobar rápidamente con curl

```bash
# Reemplaza por tu dominio
BASE=https://<tu-dominio>
curl -I "$BASE/login"                 # 200
curl -I "$BASE/profile"               # 307/308 → /login (sin sesión)
curl -s "$BASE/api/auth/providers"    # JSON con providers
```

---

## 13. Estrategia de rollback

### Identificar un despliegue defectuoso

- **Síntomas:** errores 500 en runtime (Vercel → Logs), smoke test rojo, o un flujo clave roto.
- **Confirma el alcance:** ¿es de código (revierte el deploy) o de datos/esquema (revisa la
  última migración)?

### Volver a un deployment anterior en Vercel (lo más rápido)

1. *Vercel → Deployments*.
2. Localiza el último deployment **bueno** (verde) de Production.
3. Menú `…` → **Promote to Production** (o *Rollback*). Vercel repromociona ese build **sin
   rebuild**, restaurando el estado en segundos.

### Revertir un commit (para arreglar el código)

```bash
git revert <sha-malo>     # crea un commit que deshace el cambio (seguro para historial compartido)
git push origin master    # dispara CI + nuevo deploy
```
> Prefiere `git revert` sobre `git reset --hard` en ramas compartidas: no reescribe historial.

### Migraciones de base de datos incompatibles (lo más delicado)

- **Regla:** las migraciones **no se “deshacen” automáticamente**. Prisma no genera *down*
  migrations.
- **Si usaste expand‑contract** (recomendado): revertir el **código** basta, porque el esquema
  nuevo es compatible con el código viejo. No toques la DB.
- **Si una migración rompió el esquema:** crea una **nueva migración correctiva** (forward-fix)
  y aplícala con `prisma migrate deploy`. Restaurar un backup de la DB es el último recurso y
  debe hacerse con cuidado (posible pérdida de datos entre el backup y ahora).

### Información a recopilar antes de un rollback

- SHA del deployment defectuoso y del último bueno.
- Logs de runtime/build del deployment malo.
- ¿Hubo migración asociada al merge? (revisa `prisma/migrations` en ese rango de commits).
- Impacto (¿usuarios afectados? ¿datos escritos con el esquema nuevo?).

---

## 14. Solución de problemas

Formato: **Síntoma → Causa probable → Diagnóstico → Solución.**

### Instalación / lockfile

- **Síntoma:** `ERR_PNPM_OUTDATED_LOCKFILE` en CI/Vercel.
  **Causa:** `package.json` cambió sin actualizar `pnpm-lock.yaml`.
  **Diagnóstico:** `git diff package.json pnpm-lock.yaml`.
  **Solución:** `pnpm install` en local y commitea el lockfile.

- **Síntoma:** `postinstall` falla con `PrismaConfigEnvError: DIRECT_URL`.
  **Causa:** `prisma generate` (postinstall) carga `prisma.config.ts`, que exige `DIRECT_URL`.
  **Diagnóstico:** ¿está `DIRECT_URL` en el entorno de ese paso (Vercel/CI/Docker)?
  **Solución:** define `DIRECT_URL` (basta una URL válida en build). En Vercel, añádela a Prod y
  Preview; en CI ya va inline; en Docker va como `ENV` placeholder en `Dockerfile.test`.

### Versiones de Node

- **Síntoma:** build ok en local, roto en CI/Vercel (o al revés).
  **Causa:** versión de Node distinta.
  **Diagnóstico:** compara `node -v` con `.nvmrc` (`24`).
  **Solución:** usa Node 24 en todos lados (setup-node lee `.nvmrc`; en Vercel fija 24.x).

- **Síntoma:** en Docker/CI, `pnpm install` falla con `This version of pnpm requires at least
  Node.js v22.13` y/o `No such built-in module: node:sqlite`.
  **Causa:** **pnpm 11.x** (exige Node ≥ 22.13) corriendo sobre un Node < 22.13 (p. ej. Node 20).
  **Diagnóstico:** `node -v` en el entorno que falla; compáralo con el mínimo de pnpm 11.
  **Solución:** este proyecto usa **Node 24** (`.nvmrc`, `engines`, `node:24-slim`, Vercel) justo
  para poder usar **pnpm 11.10.0**. Mantén Node ≥ 22.13 en TODOS los entornos. Si tuvieras que
  correr en Node 20, baja pnpm a la rama 10.x en `packageManager`.

### TypeScript

- **Síntoma:** `Object is possibly 'undefined'` en accesos por índice.
  **Causa:** `noUncheckedIndexedAccess`.
  **Solución:** valida el `undefined`; no abuses de `!`.

### Tests: verde en local, rojo en CI

- **Síntoma:** `test:integration` pasa en local pero falla en `docker-validate`.
  **Causa habitual:** en local usabas datos ya sembrados; el compose de test parte de una DB
  **efímera**.
  **Diagnóstico:** ¿la corrida corrió `migrate deploy` + `db seed` antes de los tests?
  **Solución:** el `command` del compose ya los encadena; asegúrate de no haber alterado ese orden.

- **Síntoma:** `DATABASE_URL no está definida`.
  **Causa:** falta el entorno en el runner del test.
  **Solución:** en local, `.env` con las URLs; en Docker, el `environment` del compose ya las pone.

### Variables de entorno ausentes

- **Síntoma:** build de Vercel: *“Variables de entorno inválidas o ausentes … DATABASE_URL”*.
  **Causa:** falta una de las 5 requeridas en ese entorno de Vercel.
  **Solución:** añádela en *Environment Variables* para Production **y** Preview, y redeploy.

### Docker

- **Síntoma:** `docker: Cannot connect to the Docker daemon`.
  **Causa:** Docker no está corriendo.
  **Solución:** abre Docker Desktop y reintenta.

- **Síntoma:** el puerto 5432/5433 está ocupado.
  **Causa:** ya tienes un Postgres local (dev) usando ese puerto.
  **Solución:** el compose de test mapea a **5433** por defecto; cambia `DB_TEST_HOST_PORT` si
  hace falta. (`app-test` no depende del puerto host.)

### Caché

- **Síntoma:** cambios que no se reflejan / cliente Prisma viejo.
  **Causa:** caché de dependencias o de la imagen Docker.
  **Diagnóstico/Solución:** en Docker, `--build` reconstruye; para limpiar: `docker compose -f
  docker-compose.test.yml build --no-cache`. En Vercel, *Redeploy* con *“Clear build cache”*.

### Vercel build

- **Síntoma:** `@prisma/client did not initialize yet. Please run "prisma generate"`.
  **Causa:** el `postinstall` no corrió (posible caché de deps que lo omitió).
  **Solución:** *fallback* → Build Command = `prisma generate && next build`.

### Prisma / conexión a la DB

- **Síntoma:** `P1001: Can't reach database server` en runtime.
  **Causa:** `DATABASE_URL` incorrecta, DB caída, o (Neon) demasiadas conexiones.
  **Diagnóstico:** revisa Logs de runtime; prueba la cadena con un cliente SQL.
  **Solución:** usa la cadena **pooled** de Neon en `DATABASE_URL`; verifica el rol `app_user`.

- **Síntoma:** consultas devuelven **0 filas** inesperadamente en producción.
  **Causa:** RLS activa y no se fijó `app.current_tenant` en la sesión.
  **Diagnóstico:** es el comportamiento correcto de RLS (deniega si no hay tenant activo).
  **Solución:** asegúrate de que el repositorio fije el tenant (contexto) antes de consultar.

### Diferencias Windows / Linux / GitHub Actions

- **Síntoma:** `El token '&&' no es un separador de instrucciones válido en esta versión` al
  encadenar comandos.
  **Causa:** estás en **Windows PowerShell 5.1**, que no soporta el operador `&&` (llegó en
  PowerShell 7). Los comandos son correctos; el problema es el encadenado.
  **Solución (elige una):**
  1. **Un comando por línea** (más simple y claro):
     ```powershell
     pnpm lint
     pnpm typecheck
     pnpm test:unit
     pnpm build
     ```
  2. **One-liner que se detiene ante un fallo** en PowerShell 5.1 (guarda `$?`):
     ```powershell
     pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm test:unit }; if ($?) { pnpm build }
     ```
     (Ojo: `;` a secas **no** corta la cadena si algo falla; por eso el `if ($?)`.)
  3. **Usa PowerShell 7** (`pwsh`), donde `&&` funciona igual que en bash:
     `winget install --id Microsoft.PowerShell`.
  > En CI (Linux/`ubuntu-latest`) y dentro de Docker sí se usa `&&`: allí el shell es `sh`/bash.

- **Síntoma:** rutas o scripts que fallan solo en Windows.
  **Causa:** fin de línea (CRLF), rutas con `\`, o binarios nativos.
  **Solución:** el proyecto ya evita binarios problemáticos (usa `bcryptjs`, portable). Deja que
  Git normalice EOL; los comandos de esta guía usan `pnpm` (multiplataforma). CI corre en
  `ubuntu-latest` (Linux), que es el entorno de referencia.

### Monorepo

- **No aplica:** `chart-wise` **no es un monorepo**. Root Directory en Vercel = `.`. Si alguien
  lo cambia por error, los builds fallarán por no encontrar `package.json`.

---

## 15. Checklist final

### Preparación local
- [ ] Node 24+ y pnpm 11.10.0 activos (`node -v`, `pnpm -v`; la versión sale de `packageManager`).
- [ ] `pnpm install --frozen-lockfile` OK (se generó `src/generated/prisma`).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build` en verde.
- [ ] `.env` completo con las 5 requeridas.

### Docker
- [ ] Docker Desktop corriendo.
- [ ] `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from app-test` → exit 0.
- [ ] `docker compose -f docker-compose.test.yml down -v` limpia todo.

### GitHub
- [ ] Repo **público** con rama `master`.
- [ ] Branch protection en `master`: PR obligatorio + status checks (`Lint · Typecheck · Unit ·
  Build` y `Docker · Integration & Isolation (RLS)`) + up-to-date + no bypass.
- [ ] *Require approvals* = `0` si trabajas solo (si no, no podrás mergear tus propios PRs).

### GitHub Actions
- [ ] `ci.yml`, `migrate-production.yml`, `smoke.yml` presentes en `.github/workflows/`.
- [ ] `DIRECT_URL` guardado como **repository secret** *(ver §9.2; Environment con reviewers opcional en repo público)*.
- [ ] Un PR de prueba muestra los dos checks corriendo.

### Vercel
- [ ] Proyecto importado; Framework = Next.js; Root = `.`; Node = 20.
- [ ] Install Command = `pnpm install --frozen-lockfile`; Build = `pnpm build`.
- [ ] Preview Deployments funcionando en PRs.

### Variables de entorno
- [ ] 5 requeridas + `APP_URL` en Vercel, para **Production** y **Preview**.
- [ ] `DIRECT_URL` como **repository secret** en *Settings → Secrets and variables → Actions*.
- [ ] Ningún secreto real commiteado (`.env` ignorado; `.env.test` solo dummy).

### Base de datos
- [ ] Postgres de producción (Neon) creado, con cadenas *pooled* (app) y *direct* (owner).
- [ ] Rol `app_user` provisionado con password segura y `GRANT`s; usado en `DATABASE_URL`.
- [ ] `migrate-production.yml` aplicó las migraciones sin error.

### Pruebas
- [ ] Suite unit verde en CI.
- [ ] Integración/aislamiento (RLS) verde en `docker-validate`.

### Seguridad
- [ ] Permisos de Actions al mínimo (`contents: read`).
- [ ] Secretos solo en Vercel/GitHub, nunca en el repo ni en la imagen Docker.
- [ ] Redirect URI de Google restringido al dominio real.

### Despliegue en producción
- [ ] Merge a `master` con checks verdes.
- [ ] Production desplegado en Vercel con el SHA esperado.

### Validación posterior
- [ ] `smoke.yml` verde.
- [ ] Smoke manual (login Google + credenciales, `/profile`, logs limpios).

### Rollback
- [ ] Sabes cómo *Promote/Rollback* un deployment anterior en Vercel.
- [ ] Sabes que las migraciones se arreglan **hacia adelante** (forward-fix), no con *down*.

---

## Archivos creados y modificados

**Modificados**
- `package.json` — añadidos 3 scripts (`postinstall` → `prisma generate`, `test:unit`,
  `test:integration`) y el campo `packageManager` (`pnpm@11.10.0`, versión única para
  local/CI/Docker).

**Creados**
- `docs/vercel-cicd-deployment-guide.md` — esta guía.
- `.dockerignore` — contexto de build limpio y sin secretos.
- `Dockerfile.test` — imagen de validación (Node 24 + pnpm 11.10.0).
- `docker-compose.test.yml` — Postgres efímero + runner de integración/aislamiento.
- `.env.test` — valores dummy versionados para tests.
- `.github/workflows/ci.yml` — gate de PR/push (jobs `quality` y `docker-validate`).
- `.github/workflows/migrate-production.yml` — `prisma migrate deploy` controlado.
- `.github/workflows/smoke.yml` — smoke test post-deploy (opcional).

**No modificados a propósito**
- `next.config.ts`, `prisma/*`, `src/**` (lógica de negocio y arquitectura intactas).

---

## Decisiones técnicas tomadas

1. **Vercel Git nativo + CI como gate** (en vez de desplegar desde Actions con Vercel CLI).
   - *Ventaja:* menos superficie y cero duplicación de despliegue; sin `VERCEL_TOKEN` en Actions.
   - *Desventaja:* migrate y deploy corren en paralelo (mitigado con expand‑contract).
   - *Alternativa (deploy desde Actions):* da orden estricto CI→migrate→deploy pero añade
     secretos y YAML; recomendable solo si necesitas gatear el deploy o migraciones rompientes.
2. **Migraciones en un job dedicado y serial**, no en el build de Vercel → evita migrar en cada
   Preview y las condiciones de carrera.
3. **`postinstall: prisma generate`** → el cliente gitignoreado se genera en todos los entornos.
4. **Docker solo para validación** (sin Dockerfile de producción) → Vercel construye nativo;
   Docker aporta reproducibilidad de las pruebas con DB.
5. **Scripts `test:unit`/`test:integration`** → separan el gate rápido de las pruebas con DB, sin
   romper el `test` existente.
6. **Variables dummy inline en `ci.yml`** para satisfacer el fail‑fast de `next build`/`generate`
   sin exponer secretos.

---

## Comandos exactos para validar localmente

```bash
# 1) Instalación reproducible (genera el cliente Prisma vía postinstall)
pnpm install --frozen-lockfile

# 2) Base de datos local + esquema + datos (para las pruebas con DB)
pnpm db:up
pnpm db:migrate
pnpm db:seed

# 3) Gate rápido (lo mismo que el job `quality`)
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build            # requiere las 5 variables en tu .env

# 4) Pruebas con DB (lo mismo que el job `docker-validate`, pero contra tu Postgres local)
pnpm test:integration

# 5) Reproducir EXACTAMENTE el job de Docker (Postgres efímero + migrate + seed + tests)
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from app-test
docker compose -f docker-compose.test.yml down -v
```

## Pasos exactos para comprobar que el pipeline funciona

1. Crea una rama y un PR trivial: `git switch -c chore/ci-smoke`, cambia esta guía, `git push -u
   origin chore/ci-smoke`, abre PR a `master`.
2. En la pestaña *Checks* del PR verás correr **`Lint · Typecheck · Unit · Build`** y **`Docker ·
   Integration & Isolation (RLS)`**.
3. En el PR aparecerá el comentario/estado de **Vercel** con la URL del **Preview**. Ábrela.
4. Configura branch protection (§5) con ambos checks. Verifica que **no** puedes mergear con un
   check en rojo (en el repo público la regla se **aplica**).
5. Merge a `master`: observa en *Actions* el job **`Migrate Production DB`** y en *Vercel* el
   **Production Deployment**.
6. Tras el deploy, revisa el workflow **`Smoke (post-deploy)`** (si Vercel emite
   `deployment_status`) y haz el smoke manual de §12.

## Limitaciones y riesgos pendientes

- **Repo público (para gate gratis y obligatorio):** el código y el **historial de git** quedan
  visibles para cualquiera; verifica que nunca se commiteó un secreto real. Si volvieras a
  **privado**, branch protection dejaría de aplicarse en Free (gate informativo) salvo plan de pago.
  Ver §5.
- **Provisión del rol `app_user` en Neon** no está automatizada: hay que crearlo/ajustarlo con
  una password segura y sus `GRANT`s antes del primer runtime real.
- **Orden migrate ↔ deploy** en el modelo nativo es paralelo → depende de disciplina
  **expand‑contract** para cambios de esquema rompientes.
- **Sin E2E:** no hay Playwright; la verificación post-deploy es *smoke* (no cubre flujos
  completos de UI automáticamente).
- **Servicios futuros** (microservicio FastAPI, email/SMTP, storage) aún no tienen variables ni
  código; cuando se implementen, habrá que añadir sus secretos a Vercel/GitHub y ampliar el
  smoke/tests.
- **`smoke.yml` depende** de que Vercel esté integrado como *GitHub Deployment* para emitir el
  evento `deployment_status`; si no, ese workflow no se dispara (no es un fallo del pipeline).
