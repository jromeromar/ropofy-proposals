# Ropofy — Renderizador de propuestas

Aplicación que renderiza propuestas comerciales de Ropofy a partir de un
archivo `propuesta.json` (la salida del pipeline de diagnóstico). Convierte
ese contrato en dos experiencias distintas: la **presentación en vivo** del
consultor y el **documento del cliente**, que viaja solo y se explica solo.

Todo el texto de cara al usuario está en **español**; el código, los
comentarios y los nombres de variables, en inglés.

## Cómo ejecutar

```bash
npm install
npm run dev        # http://localhost:3000  (redirige a /consultor)
npm run seed       # carga la propuesta Activos y deja un expediente completo
```

Otros comandos:

```bash
npm run build      # build de producción (debe pasar sin errores)
npm run start      # sirve el build de producción
npm run test       # 66 pruebas (Vitest), incluida la barrida final
```

## Despliegue en Vercel

El proyecto es **zero-config** para Vercel (Next.js App Router). Al conectar
el repositorio, Vercel detecta el framework por `vercel.json`
(`"framework": "nextjs"`).

Variables de entorno (todas opcionales, ver `.env.example`):

| Variable | Para qué |
| --- | --- |
| `ACCEPTANCE_WEBHOOK_URL` | POST de aceptación hacia n8n u otro. Si está vacía, se registra local y no se envía nada. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Activan Vercel KV como almacenamiento. Sin ellas, memoria + archivo local. |

> **Importante en serverless sin KV:** el flujo enviar → abrir `/p/` cruza
> varias funciones, y la memoria no se comparte entre ellas. Para probar el
> flujo completo en un preview, configura Vercel KV (o pruébalo en local).

## El almacenamiento (y el camino a Postgres)

Toda la persistencia pasa por `lib/storage.ts`, detrás de una interfaz
pequeña y agnóstica del backend:

```
saveProposal · getProposal · listProposals · saveVersion
saveSentVersion · getByToken · aceptarVersion · registrarEvento
```

Hoy corre sobre **Vercel KV** cuando está configurado; si no, un `Map` en
memoria respaldado por `./.data/proposals.json` para desarrollo local. La UI
sólo conoce esta interfaz y las formas `StoredProposal` / `SentVersion`, así
que **mañana se cambia el backend a Postgres sin tocar una línea de UI**:
basta con una nueva implementación de la interfaz.

## El flujo completo del consultor

```
cargar → presentar → cotizar → enviar → expediente
```

1. **Cargar** (`/consultor/nueva`) — se pega o sube el `propuesta.json`. Se
   **valida la estructura antes de renderizar nada** (`lib/validateProposal.ts`,
   errores en español, todos a la vez). Si es válida, se persiste como
   borrador.
2. **Presentar** (`/consultor/[id]/presentacion`) — vista de baja densidad
   para proyectar en la reunión. Un selector de plan recalcula el plano, las
   barras de madurez, la nota proyectada y el precio.
3. **Cotizar** (`/consultor/[id]/cotizar`) — descuento opcional, vigencia,
   autor y motivo; compuerta de aprobación por umbral; vista previa en vivo
   del bloque de precio del cliente. Si ya hay una versión enviada, pide
   confirmación antes de generar la siguiente.
4. **Enviar** — genera el **documento del cliente congelado**: una copia del
   `propuesta.json` con todo lo interno removido y la condición comercial
   embebida como valores fijos. Cada envío es una **versión inmutable**
   (v1, v2…) con un **token** único; los tokens viejos siguen sirviendo su
   propia versión. Al aceptar se dispara el webhook (si está configurado).
5. **Expediente** (`/consultor/[id]`) — el rastro de auditoría: tabla de
   versiones, feed de actividad por versión, la **señal de decisión**
   (cuando el documento se abre ≥2 veces en 48 h sin aceptar), y el registro
   de aceptación con el botón «Descargar orden (imprimir)».

## Qué sirve cada token `/p/`

Cada `/p/{token}` resuelve a **una versión congelada** y renderiza el
documento completo del cliente **sólo desde ese snapshot** (nunca desde el
borrador vivo). Sin login. El documento:

- se explica solo, a densidad de texto completa (11 secciones);
- deja explorar los tres planes (el switcher recalcula plano, barras y
  precio), partiendo del plan que fijó el consultor;
- muestra el bloque de precio **exactamente** como se congeló: con descuento
  vigente (lista tachada + precio final + línea de condición), expirado
  (precio de lista + nota de expiración) o sin condición (sólo lista);
- permite **aceptar** (nombre, correo, observaciones) — un segundo accept
  sobre la misma versión se rechaza del lado del servidor;
- captura telemetría mínima (aperturas, cambios de plan, tiempo en página)
  sin cookies ni scripts de terceros; las aperturas son la señal de compra.

El mismo documento, con su CSS de impresión, es el **PDF congelado de la
orden** (botón «Descargar orden» en el expediente → `/p/{token}?print=1`).

## Reglas duras (contractuales)

- Nada interno cruza al cliente: `lib/clientDocument.ts` construye el snapshot
  quitando ids internos, `tipo`, `multiplicador_calculado`, los internos de
  precio (`base_por_plan`, `tramos_factor`, `limite_descuento_sin_aprobacion`,
  `desglose_interno`) y el `motivo`. Los controles de descuento viven **sólo**
  en el panel del consultor; jamás viajan al cliente.
- `lib/rules.ts` prohíbe en toda salida de cliente los ids internos y las
  palabras `esfuerzo` / `jornadas` / `multiplicador`, y la fórmula de precio.
- Precios como enteros limpios en locale `es-CO` (`$2.070 USD`).
- El documento del cliente es una **respuesta distinta** servida bajo `/p/`,
  nunca la vista del consultor con controles ocultos.

## El fixture ES el contrato

`fixtures/propuesta-activos-v1.json` es el `propuesta.json` **real** del
pipeline. Una prueba lo carga y exige **cero errores** de validación: si el
contrato y la app se separan, esa prueba grita primero.

## Pruebas

```bash
npm run test
```

Cubre validación, precios, condición/expiración, nota de madurez, construcción
del snapshot (claves prohibidas ausentes), el flujo de envío/aceptación, el
webhook (forma del payload y supervivencia a un 500), el expediente
(feed y señal) y la **barrida final** (`tests/sweep.spec.ts`) con las diez
invariantes de cierre.

## Estructura

```
app/
  consultor/                         # rutas del consultor
    page.tsx                         # listado
    nueva/page.tsx                   # intake + validación
    [id]/page.tsx                    # EXPEDIENTE (auditoría)
    [id]/presentacion/               # presentación en vivo
    [id]/cotizar/                    # panel de cotización + envío
  p/[token]/                         # DOCUMENTO DEL CLIENTE (congelado)
  api/proposals/route.ts             # intake API
  api/telemetria/route.ts            # captura de eventos del documento
lib/
  types.ts validateProposal.ts rules.ts storage.ts
  pricing.ts condition.ts clientDocument.ts
  presentacionVM.ts clientDocVM.ts mapLayout.ts grade.ts
  webhook.ts expediente.ts
fixtures/propuesta-activos-v1.json   # el contrato real
scripts/seed.ts                      # npm run seed
tests/                               # Vitest + tests/sweep.spec.ts
```
