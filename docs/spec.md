# chart-wise — Especificación de Arquitectura

- **Estado:** Draft para revisión
- **Fecha:** 2026-07-09
- **Alcance:** Arquitectura, estructura de directorios, bounded contexts y convenciones transversales del proyecto.
- **Objetivo pedagógico:** Practicar **Clean Architecture (Hexagonal / Ports & Adapters)** y **Domain-Driven Design** sobre **Next.js 16 (App Router) + React 19 + Prisma + Postgres**, con multi-tenancy real.

> Este documento **no** especifica el comportamiento detallado de cada feature. Cada feature (registro, invitaciones, upload, análisis, dashboards…) tendrá su propio spec. Aquí se fija el **esqueleto** y las **reglas del juego** que todos los features deben respetar.

---

## 1. Contexto y propósito

chart-wise es una aplicación SaaS multi-tenant donde un usuario, dentro de una **organización (tenant)**, **sube datasets**, los envía a un **microservicio de análisis externo (FastAPI)** y visualiza los resultados como **dashboards e insights**.

Esta spec gobierna **cómo se organiza el código** para que:

1. El dominio sea independiente del framework y de la infraestructura.
2. Los límites entre contextos (identidad, tenancy, datasets, analytics) sean explícitos y **verificables por tests**, no solo por disciplina.
3. El aislamiento entre tenants sea una propiedad garantizada, no un accidente.

---

## 2. Goals y Non-Goals

**Goals**

- Estructura de directorios definitiva y sus reglas de dependencia.
- Definición de los bounded contexts y sus responsabilidades.
- Estrategia de aislamiento multi-tenant (datos + tests).
- Convenciones transversales: autorización, eventos de dominio, manejo de errores, testing, configuración.

**Non-Goals**

- Comportamiento funcional detallado de cada feature (van en specs propios).
- Diseño visual / UI (tokens, componentes concretos).
- Implementación interna del microservicio de análisis en Python.
- Estrategia de despliegue / infraestructura cloud.

---

## 3. Capacidades del producto (user stories que justifican la arquitectura)

Estas historias existen para **justificar la existencia de cada bounded context**. No son el spec funcional completo.

- **US-01** — Como visitante, quiero registrarme e iniciar sesión, para acceder a la aplicación. *(→ identity)*
- **US-02** — Como usuario autenticado, quiero crear mi primera organización, para tener un espacio de trabajo. *(→ tenancy)*
- **US-03** — Como admin de una organización, quiero invitar miembros y asignarles un rol, para colaborar. *(→ tenancy)*
- **US-04** — Como usuario, quiero pertenecer a varias organizaciones con roles distintos y cambiar de tenant activo. *(→ tenancy)*
- **US-05** — Como miembro de un tenant, quiero subir un archivo de datos y ver su metadata. *(→ datasets)*
- **US-06** — Como miembro, quiero lanzar un análisis sobre un dataset y seguir su estado hasta completarse. *(→ analytics)*
- **US-07** — Como miembro, quiero guardar y volver a abrir dashboards e insights derivados de un análisis. *(→ analytics)*
- **US-08** — Como usuario, quiero que los datos de una organización sean **inaccesibles** desde otra. *(→ transversal: aislamiento)*

---

## 4. Principios arquitectónicos (normativos)

Estos principios son **requisitos**, no sugerencias. Se enumeran como FR/NFR en las secciones 9–11 y se verifican con `tests/architecture/` y `tests/isolation/`.

1. **Regla de dependencia (Clean Architecture).** Las dependencias apuntan hacia adentro:
   `presentation → application → domain` y `infrastructure → application/domain`.
   **`domain/` no importa de ninguna otra capa** ni de librerías de framework/infra (ni Next, ni Prisma, ni Auth.js).
2. **Bounded contexts aislados.** Cada módulo expone **una única API pública** (`index.ts`). Ningún módulo hace *deep-import* de los internals de otro (`@/modules/x/infrastructure/...` desde `y` está prohibido).
3. **`app/` es un adaptador de entrada tonto.** Un `page.tsx` / `route.ts` resuelve contexto, invoca un caso de uso (vía `di.ts`) y renderiza/responde. **No contiene lógica de negocio.**
4. **`middleware.ts` corre en Edge.** Solo redirecciones y checks baratos de sesión. **Sin Prisma.**
5. **Los contextos se comunican por contrato**, no por acoplamiento: por la API de aplicación de otro módulo o por **eventos de dominio**. `analytics` no conoce los internals de `tenancy`.
6. **La ceremonia se escala al módulo.** Módulos ricos (identity, analytics) usan las 4 capas completas; módulos casi-CRUD (datasets) usan un `domain/` mínimo + repositorio, sin DTOs/mappers ceremoniales.

---

## 5. Bounded contexts

| Módulo | Responsabilidad (solo esto) | Agregados / entidades clave | Depende de |
|---|---|---|---|
| **identity** | *AuthN*: quién eres. Usuario, credenciales, sesión. | `User`, `Email`, `PasswordHash` | — (núcleo) |
| **tenancy** | Organizaciones, membresías, invitaciones y **autorización** (roles/permisos por membresía). | `Tenant`, `Membership`, `Invitation`, `Role` | `identity` (referencia por id) |
| **datasets** | Archivos subidos y su metadata. Módulo delgado. | `Dataset` | `tenancy` (tenant scope) |
| **analytics** | Análisis (máquina de estados), dashboards, insights. Integra el microservicio. | `Analysis`, `Dashboard`, `Insight` | `datasets`, `tenancy` |

**Regla de dirección:** las flechas de dependencia entre módulos van hacia `identity`/`tenancy` (los núcleos), nunca al revés. `identity` **no** conoce a `tenancy`.

---

## 6. Estructura de directorios (definitiva)

```
chart-wise/
├── docs/
│   ├── spec.md                  # este documento
│   ├── adr/                     # decisiones puntuales numeradas (ver §8)
│   └── contracts/               # OpenAPI del microservicio + contrato del webhook
├── prisma/
│   ├── schema.prisma            # incluye políticas RLS (ver ADR-001)
│   └── migrations/
├── public/
├── tests/
│   ├── unit/                    # dominio + casos de uso (sin DB, sin Next)
│   ├── integration/             # repositorios contra Postgres real
│   ├── isolation/               # OBLIGATORIO: aislamiento entre tenants (ver SC-05)
│   ├── architecture/            # fitness tests: la regla de dependencia como test (ver SC-01/02)
│   └── e2e/                     # Playwright (flujos completos)
│
└── src/
    ├── app/                     # CLEAN: círculo externo (frameworks & drivers). Solo enruta y compone.
    │   ├── (public)/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx                    # landing
    │   │   ├── login/page.tsx
    │   │   ├── register/page.tsx
    │   │   └── invite/[token]/page.tsx
    │   ├── (private)/
    │   │   ├── layout.tsx                  # exige sesión
    │   │   ├── onboarding/page.tsx         # crear primera organización
    │   │   ├── select-org/page.tsx         # selector de tenant activo
    │   │   ├── profile/page.tsx            # perfil global (fuera del tenant)
    │   │   └── org/[tenantSlug]/           # TODO lo scoped a un tenant vive aquí
    │   │       ├── layout.tsx              # resuelve TenantContext · sidebar + header
    │   │       ├── loading.tsx · error.tsx · not-found.tsx
    │   │       ├── page.tsx                # overview
    │   │       ├── upload/page.tsx
    │   │       ├── dashboards/{page.tsx,[dashboardId]/page.tsx}
    │   │       ├── history/page.tsx
    │   │       ├── members/page.tsx
    │   │       └── settings/page.tsx
    │   ├── api/
    │   │   ├── auth/[...nextauth]/route.ts
    │   │   ├── uploads/presign/route.ts
    │   │   └── webhooks/analysis/route.ts  # valida firma → delega a HandleAnalysisResult
    │   ├── layout.tsx · globals.css · favicon.ico
    │
    ├── modules/                 # bounded contexts (el corazón)
    │   ├── identity/            # SOLO AuthN (antes 'iam' — ver ADR-003)
    │   │   ├── domain/
    │   │   │   ├── entities/user.ts
    │   │   │   ├── value-objects/{email.ts,password-hash.ts}
    │   │   │   ├── events/user-registered.event.ts
    │   │   │   ├── errors/
    │   │   │   └── ports/user.repository.ts        # interface
    │   │   ├── application/  (use-cases/ · dto/)
    │   │   ├── infrastructure/
    │   │   │   ├── persistence/{prisma-user.repository.ts,mappers/user.mapper.ts}
    │   │   │   ├── auth/auth.config.ts             # Auth.js vive AQUÍ
    │   │   │   └── crypto/bcrypt-hasher.ts
    │   │   ├── presentation/ (actions/ · schemas/ · components/)
    │   │   ├── di.ts            # composition root del módulo
    │   │   └── index.ts         # API PÚBLICA (lo único importable desde fuera)
    │   │
    │   ├── tenancy/             # orgs, membresías, invitaciones y AUTORIZACIÓN
    │   │   ├── domain/
    │   │   │   ├── entities/{tenant.ts,membership.ts,invitation.ts}
    │   │   │   ├── value-objects/role.ts                 # el rol vive AQUÍ (ADR-002)
    │   │   │   ├── authorization/permission-matrix.ts    # matriz rol→permisos (es dominio)
    │   │   │   ├── services/permission-checker.ts
    │   │   │   └── events/member-invited.event.ts
    │   │   ├── application/ · infrastructure/ · presentation/ · di.ts · index.ts
    │   │
    │   ├── datasets/            # módulo delgado: domain mínimo + repositorio
    │   │   ├── domain/ (entities/dataset.ts · ports/dataset.repository.ts)
    │   │   ├── application/ · infrastructure/ · presentation/ · di.ts · index.ts
    │   │
    │   └── analytics/           # análisis, dashboards, insights
    │       ├── domain/
    │       │   ├── entities/{analysis.ts,dashboard.ts,insight.ts}   # analysis = máquina de estados
    │       │   ├── events/analysis-completed.event.ts
    │       │   └── ports/analysis-engine.ts             # PUERTO hacia el microservicio
    │       ├── application/     # opcional: commands/ vs queries/ (CQRS ligero)
    │       ├── infrastructure/
    │       │   └── engine/
    │       │       ├── fastapi-analysis-engine.ts       # anti-corruption layer
    │       │       └── fake-analysis-engine.ts          # desarrollo/tests sin Python
    │       ├── presentation/ · di.ts · index.ts
    │
    ├── shared/                  # kernel compartido, SIN negocio propio
    │   ├── domain/              # Entity · AggregateRoot · ValueObject · DomainEvent
    │   │                        # Result<T,E> · DomainError · Guard · UniqueId
    │   ├── application/          # UseCase<In,Out> · AppContext · TenantContext · EventBus (port)
    │   ├── infrastructure/       # prisma client · http client · logger · in-memory event bus
    │   └── presentation/         # hooks · providers · guards de UI (NO son authz real)
    │
    ├── components/ (ui/ shadcn · layout/ shells)
    ├── config/
    │   ├── env.ts               # validación con Zod. Fail-fast.
    │   └── routes.ts            # rutas públicas / privadas  (los permisos NO viven aquí)
    ├── lib/utils.ts            # cn() y helpers puros. Nada más.
    ├── instrumentation.ts       # observabilidad (opcional)
    └── middleware.ts            # Edge. Solo redirecciones. Sin Prisma.
```

---

## 7. Convenciones transversales

### 7.1 Autorización
La política de autorización **es dominio** y vive en `tenancy` (`authorization/permission-matrix.ts` + `permission-checker.ts`). `config/` **no** contiene permisos. Los *guards* de UI en `shared/presentation` son cosméticos (ocultan botones); **la autorización real se ejecuta en el servidor** dentro de los casos de uso.

### 7.2 Aislamiento multi-tenant (ver ADR-001)
Estrategia *shared database* con columna `tenantId` **más Row-Level Security de Postgres**. Cada repositorio filtra por `tenantId`, y RLS actúa como red de seguridad: si un `where` se olvida, la base de datos igualmente niega el acceso. El `TenantContext` (en `shared/application`) transporta el tenant activo hasta el repositorio.

### 7.3 Manejo de errores
Casos de uso devuelven `Result<T, DomainError>` (nunca lanzan para errores esperados). Los errores inesperados suben al `error.tsx` del segmento correspondiente. Validación de input externo (forms, webhooks, respuestas del microservicio) con Zod **en el borde** (schemas de `presentation` / contratos).

### 7.4 Eventos de dominio (ver ADR-004)
Los agregados emiten eventos (`AnalysisCompleted`, `MemberInvited`, `UserRegistered`). Un `EventBus` (puerto en `shared/application`, implementación in-memory síncrona en `shared/infrastructure`) los despacha. Es el pegamento entre contextos sin acoplarlos.

### 7.5 Composición e inyección
Cada módulo tiene un `di.ts` (composition root) que instancia repositorios, servicios y casos de uso, eligiendo la implementación real o el *fake* según entorno. `app/` obtiene los casos de uso desde ese `di.ts`.

### 7.6 Testing
| Suite | Qué prueba | Sin |
|---|---|---|
| `unit/` | dominio + casos de uso | DB, Next |
| `integration/` | repositorios | — (Postgres real) |
| `isolation/` | que un tenant no accede a datos de otro | — |
| `architecture/` | regla de dependencia y límites de módulo | — |
| `e2e/` | flujos completos (Playwright) | — |

---

## 8. Decisiones resueltas (ADR)

### ADR-001 — Aislamiento de datos: shared DB + `tenantId` + RLS
**Contexto:** app multi-tenant; se necesita aislamiento fuerte sin la complejidad operativa de schema/DB por tenant.
**Decisión:** una sola base de datos, discriminador `tenantId` en las tablas scoped, **y políticas RLS de Postgres** como defensa en profundidad.
**Consecuencias:** `schema.prisma` incluye políticas RLS; los repositorios setean el tenant de sesión de Postgres; `tests/isolation/` es obligatorio y bloqueante.

### ADR-002 — El rol es por-membresía, no global
**Contexto:** un usuario puede ser admin en la org A y viewer en la B.
**Decisión:** `Role` cuelga de `Membership` y vive en `tenancy`, no en `identity`. La matriz rol→permisos vive en `tenancy/domain/authorization`.
**Consecuencias:** `identity` no conoce roles; la autorización se resuelve siempre en el contexto de un tenant activo.

### ADR-003 — El módulo de identidad se llama `identity`, no `iam`
**Contexto:** al mover autorización a `tenancy`, el módulo solo gestiona *identity* (AuthN); la "A" de *Access* de IAM ya no aplica.
**Decisión:** nombrarlo `identity` para que el nombre sea honesto respecto a su responsabilidad.
**Consecuencias:** menos ambigüedad; el nombre "avisa" si alguien intenta meterle lógica de permisos.

### ADR-004 — Eventos de dominio con bus in-memory
**Contexto:** los contextos deben reaccionar entre sí (p. ej. análisis completado → notificar) sin acoplarse.
**Decisión:** eventos de dominio + `EventBus` como puerto; implementación inicial in-memory y síncrona.
**Consecuencias:** el puerto permite migrar a un bus asíncrono/persistente más adelante sin tocar el dominio.

### ADR-005 — API pública por módulo + límites verificados por linter
**Contexto:** los bounded contexts solo valen si el aislamiento se respeta.
**Decisión:** cada módulo expone `index.ts`; se prohíben *deep-imports* entre módulos, verificado con `dependency-cruiser` o `eslint-plugin-boundaries` **y** con `tests/architecture/`.
**Consecuencias:** violar un límite rompe el build/los tests, no depende de revisión manual.

---

## 9. Requisitos funcionales (arquitectura)

- **FR-01** — Cada bounded context DEBE exponer su funcionalidad únicamente a través de `modules/<ctx>/index.ts`.
- **FR-02** — `app/` (pages, layouts, route handlers) DEBE obtener casos de uso desde el `di.ts` del módulo correspondiente y no instanciar repositorios ni clientes de infraestructura directamente.
- **FR-03** — El `webhooks/analysis/route.ts` DEBE validar la firma del microservicio y delegar en el caso de uso `HandleAnalysisResult`, sin lógica de negocio propia.
- **FR-04** — Toda operación scoped a un tenant DEBE resolver el `TenantContext` a partir de `tenantSlug` antes de ejecutar el caso de uso.
- **FR-05** — La autorización DEBE evaluarse en el servidor dentro del caso de uso, usando la matriz de `tenancy`, independientemente de los guards de UI.
- **FR-06** — Los repositorios DEBEN filtrar por `tenantId`; RLS DEBE estar activo como respaldo.

## 10. Requisitos no funcionales

- **NFR-01** — `domain/` de cualquier módulo NO DEBE importar Next.js, Prisma, Auth.js ni ningún paquete de infraestructura.
- **NFR-02** — Ningún módulo DEBE importar rutas internas de otro módulo (solo su `index.ts`).
- **NFR-03** — `middleware.ts` NO DEBE importar Prisma ni ejecutar acceso a base de datos.
- **NFR-04** — `config/env.ts` DEBE validar las variables de entorno con Zod y fallar al arranque si faltan (fail-fast).
- **NFR-05** — El motor de análisis DEBE ser sustituible por un *fake* mediante configuración, sin cambios en `analytics/domain` ni `application`.

## 11. Criterios de éxito (medibles)

- **SC-01** — El test de arquitectura falla si algún archivo bajo `**/domain/**` importa Next/Prisma/Auth.js/infra. *(verifica NFR-01)*
- **SC-02** — El test de arquitectura falla ante cualquier deep-import entre módulos. *(verifica NFR-02/FR-01)*
- **SC-03** — El proyecto no arranca si falta una variable de entorno requerida. *(verifica NFR-04)*
- **SC-04** — La suite corre con el `fake-analysis-engine` sin ninguna dependencia de Python. *(verifica NFR-05)*
- **SC-05** — Existe al menos un test en `tests/isolation/` que intenta leer datos del tenant B autenticado como tenant A y **recibe cero filas**, tanto por el repositorio como con RLS. *(verifica FR-06 / US-08)*
- **SC-06** — Un `page.tsx` de ejemplo no contiene lógica de negocio: su cuerpo se limita a resolver contexto, invocar un caso de uso y renderizar. *(verifica FR-02, revisión manual)*

## 12. Edge cases

- Usuario sin ninguna organización → `onboarding` (crear primera org).
- Usuario con múltiples organizaciones → `select-org`.
- `/org/{slug}` de un tenant inexistente o al que no pertenece → `not-found.tsx` (nunca revelar existencia de otro tenant).
- Invitación con token inválido/expirado → error controlado en `invite/[token]`.
- Webhook del microservicio con firma inválida → 401, sin efectos.
- Análisis que llega a estado de error en el microservicio → la máquina de estados de `Analysis` refleja `failed`, no queda colgado.

## 13. Fuera de alcance

- Especificación funcional detallada de cada feature (specs propios posteriores).
- Diseño visual, tokens y componentes concretos.
- Internals del microservicio de análisis (solo su contrato en `docs/contracts/`).
- Billing / planes / cuotas.

## 14. Preguntas abiertas

Ninguna bloqueante. Pendientes menores para el spec de datos:
- Estrategia exacta de *storage* de archivos (S3/R2 vía presign — implícito en `uploads/presign`).
- Si `Insight` es entidad propia o value object dentro de `Dashboard` (se decidirá en el spec de analytics).
