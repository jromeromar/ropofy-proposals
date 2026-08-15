# Ropofy — Renderizador de propuestas

Renderiza propuestas comerciales de Ropofy a partir de un `propuesta.json` (la
salida del pipeline de diagnóstico), las **congela**, las **tokeniza** y captura
la **aceptación** del cliente. La **gestión** de la propuesta (estados,
actividad, señales de decisión, reportes) NO vive aquí: vive en **Ropofy**,
nuestro CRM sobre GoHighLevel. Esta app hace solo lo que solo ella puede hacer.

Todo el texto de cara al usuario está en **español**; el código, los
comentarios y los nombres de variables, en inglés.

## Qué vive aquí y qué vive en Ropofy

| Vive **aquí** (esta app) | Vive en **Ropofy** (CRM / GHL) |
| --- | --- |
| Intake + validación del `propuesta.json` | El pipeline de oportunidades |
| Vista de presentación (consultor) | Estados de la propuesta y su historia |
| Panel de cotización + política de 30% | Feed de actividad, notas, tareas |
| **Envío**: congelar snapshot, quitar claves internas, token, `/p/[token]` | La "señal de decisión" y el aviso al comercial |
| **Documento del cliente** congelado + CSS de impresión/PDF | Reportería y tableros de negocio |
| **Aceptación**: nombre, correo, observaciones, IP, precio efectivo, rechazo server-side de doble aceptación | Cierre comercial y facturación |
| El **store token→snapshot** (inmutabilidad + garantía de claves prohibidas) | — |
| **Emisión de eventos** hacia Ropofy | La **recepción y el ruteo** de esos eventos |

La inmutabilidad del snapshot y la garantía de "nada interno llega al cliente"
son el contrato de ESTA app y no pueden depender del modelo de datos del CRM;
por eso el store token→snapshot se queda aquí. Todo lo demás es gestión y vive
en Ropofy. El puente entre ambos es un **bus de eventos** (abajo).

## Cómo ejecutar

```bash
npm install
npm run dev        # http://localhost:3000  (redirige a /consultor)
npm run seed       # carga la propuesta Activos y deja versiones/documentos
```

Otros comandos:

```bash
npm run build      # build de producción (debe pasar sin errores)
npm run start      # sirve el build de producción
npm run test       # pruebas (Vitest), incluida la barrida final
```

## Despliegue en Vercel

Zero-config (Next.js App Router); `vercel.json` fija el framework. Variables de
entorno (ver `.env.example`):

| Variable | Para qué |
| --- | --- |
| `EVENTS_WEBHOOK_URL` | UN endpoint (n8n) que recibe TODOS los eventos y los rutea a GHL. Si está vacío, se registra local y no se envía nada. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) | Store compartido (Redis). **Obligatorio en serverless**: sin él, cada función tiene su propia memoria y una propuesta guardada no se encuentra en el siguiente request. |

## El almacenamiento (y el camino a Postgres)

Toda la persistencia pasa por `lib/storage.ts`, detrás de una interfaz pequeña
y agnóstica del backend (`saveProposal`, `getProposal`, `listProposals`,
`saveVersion`, `saveSentVersion`, `getByToken`, `aceptarVersion`, y las guardas
de emisión `debeEmitirApertura` / `debeEmitirExpiracion`). Hoy corre sobre
Redis (Vercel KV / Upstash) cuando hay credenciales; si no, un `Map` en memoria
respaldado por `./.data/proposals.json` para desarrollo local. Mañana se cambia
el backend a **Postgres** con una nueva implementación de la interfaz, **sin
tocar una línea de UI**.

## El flujo del consultor

```
cargar → presentar → cotizar → enviar        (la gestión sigue en Ropofy)
```

1. **Cargar** (`/consultor/nueva`) — se pega/sube el `propuesta.json`. Se
   **valida la estructura antes de renderizar nada**.
2. **Presentar** (`/consultor/[id]/presentacion`) — vista de baja densidad; el
   selector de plan recalcula plano, madurez, nota y precio.
3. **Cotizar** (`/consultor/[id]/cotizar`) — descuento opcional, vigencia,
   autor, motivo; compuerta de aprobación sobre el 30%; vista previa del precio
   del cliente; confirmación si ya existe una versión enviada.
4. **Enviar** — genera el **documento del cliente congelado** (snapshot sin
   claves internas + condición como valores fijos), como una **versión
   inmutable** (v1, v2…) con un **token**. Emite `propuesta_enviada`.

`/consultor` es solo una **lista técnica de respaldo** (cliente, id, versiones,
tokens, enlace `/p/`). La gestión —estados, actividad, señales— vive en Ropofy.

## Qué sirve cada token `/p/`

`/p/{token}` resuelve a **una versión congelada** y renderiza el documento
completo del cliente **sólo desde ese snapshot** (nunca desde el borrador vivo).
Sin login. Deja explorar los tres planes, muestra el bloque de precio tal como
se congeló (con descuento vigente / expirado / sin condición) y permite
**aceptar** (nombre, correo, observaciones); un segundo accept sobre la misma
versión se **rechaza del lado del servidor**. Con su CSS de impresión, el mismo
documento es el **PDF congelado de la orden**.

## Bus de eventos (el puente con Ropofy)

`lib/events.ts` emite hacia UN endpoint (`EVENTS_WEBHOOK_URL`), fire-and-forget,
3 reintentos con backoff; **nunca bloquea la UX**. Cada evento lleva el sobre
`{ evento, cliente, propuestaId, version, enlace, at }` más su payload:

| Evento | Cuándo | Payload |
| --- | --- | --- |
| `propuesta_enviada` | al enviar | `{ plan, precio_lista, condicion: { descuento_pct, autor, aprobador?, vigencia } }` |
| `documento_abierto` | al abrir `/p/` (máx. 1 por token cada 10 min) | `{ planVisto?, userAgent }` |
| `plan_explorado` | al cambiar de plan en `/p/` | `{ planVisto }` |
| `observacion_escrita` | primer tecleo en observaciones (sin texto) | `{}` |
| `propuesta_aceptada` | al aceptar | `{ plan, precio_final, moneda, condicion: { descuento_pct, autor, vigencia }, acepta: { nombre, correo, fecha }, observaciones }` |
| `condicion_expirada` | primera vez que se sirve un documento expirado | `{}` |

## Mapeo a GHL (para que el flujo de n8n sea trivial)

n8n recibe cada evento en `EVENTS_WEBHOOK_URL` y lo rutea a la oportunidad de
GoHighLevel (buscándola por `propuesta_id`, o creándola en `propuesta_enviada`):

- **Custom fields de la oportunidad** — al recibir `propuesta_enviada` /
  `propuesta_aceptada`, setear:
  `propuesta_id` ← `propuestaId`, `version` ← `version`, `plan` ← `plan`,
  `precio` ← `precio_lista` / `precio_final`, `enlace_propuesta` ← `enlace`,
  `estado_propuesta` ← `enviada` / `aceptada` / `expirada`.
- **Movimientos de etapa (pipeline)**:
  `propuesta_enviada` → etapa **Enviada**;
  `propuesta_aceptada` → etapa **Ganada**;
  `condicion_expirada` → marcar `estado_propuesta = expirada` (o etapa que
  corresponda).
- **Telemetría como notas/actividades** de la oportunidad:
  `documento_abierto`, `plan_explorado`, `observacion_escrita` se anexan como
  notas ("Abrió el documento — Chrome en Mac", "Vio el plan Inteligente", etc.).
- **Tarea de decisión**: cuando lleguen **2+ `documento_abierto` en 48 h sin
  aceptación**, crear una tarea para el usuario asignado:
  **"Señal de decisión: llamar"**. (La ventana de 48 h y el conteo se resuelven
  en n8n/GHL sobre las notas; esta app ya throttlea a 1 apertura / 10 min para
  no inflar el conteo.)

## Reglas duras (contractuales)

- Nada interno cruza al cliente: `lib/clientDocument.ts` construye el snapshot
  quitando ids internos, `tipo`, `multiplicador_calculado`, los internos de
  precio y el `motivo`. Los controles de descuento viven **sólo** en el panel
  del consultor.
- `lib/rules.ts` prohíbe en toda salida de cliente los ids internos y las
  palabras `esfuerzo` / `jornadas` / `multiplicador`, y la fórmula de precio.
- Precios como enteros limpios en locale `es-CO` (`$2.070 USD`).
- El documento del cliente es una **respuesta distinta** bajo `/p/`, nunca la
  vista del consultor con controles ocultos.

## El fixture ES el contrato

`fixtures/propuesta-activos-v1.json` es el `propuesta.json` **real** del
pipeline. Una prueba lo carga y exige **cero errores**: si el contrato y la app
se separan, esa prueba grita primero.

## Pruebas

```bash
npm run test
```

Cubre validación, precios, condición/expiración, nota de madurez, snapshot
(claves prohibidas ausentes), flujo de envío/aceptación, el **bus de eventos**
(forma de cada evento, supervivencia a un 500, throttle, aceptación aunque el
endpoint esté caído) y la **barrida final** (`tests/sweep.spec.ts`).

## Estructura

```
app/
  consultor/
    page.tsx                         # lista técnica de respaldo
    nueva/page.tsx                   # intake + validación
    [id]/presentacion/               # presentación en vivo
    [id]/cotizar/                    # cotización + envío (emite propuesta_enviada)
  p/[token]/                         # documento del cliente congelado (acepta, emite eventos)
  api/proposals/route.ts             # intake API
  api/telemetria/route.ts            # recibe señales del documento → emite eventos
lib/
  types.ts validateProposal.ts rules.ts storage.ts
  pricing.ts condition.ts clientDocument.ts
  presentacionVM.ts clientDocVM.ts mapLayout.ts grade.ts
  events.ts enlace.ts
fixtures/propuesta-activos-v1.json   # el contrato real
scripts/seed.ts                      # npm run seed
tests/                               # Vitest + tests/sweep.spec.ts
```
