# Ropofy — Renderizador de propuestas

Aplicación que renderiza propuestas comerciales de Ropofy a partir de un
archivo `propuesta.json` producido por el pipeline aguas arriba. Esta base
(prompt 1 de 5) construye el esqueleto, la carga y validación del JSON, y la
capa de almacenamiento. **Aún no** incluye la vista de presentación, el panel
de cotización ni el documento del cliente.

## Stack

- **Next.js (App Router) + TypeScript**, desplegable a Vercel sin
  configuración.
- Sin framework de UI: CSS global plano.
- **Almacenamiento** con abstracción intercambiable (`lib/storage.ts`): usa
  Vercel KV si está configurado; de lo contrario, un `Map` en memoria
  respaldado por un archivo JSON para desarrollo local.
- Todo el texto de cara al usuario está en **español**; el código, los
  comentarios y los nombres de variables en inglés.

## Cómo ejecutar

```bash
npm install
npm run dev      # http://localhost:3000  (redirige a /consultor)
```

Otros comandos:

```bash
npm run build    # build de producción (debe pasar sin errores)
npm run start    # sirve el build de producción
npm run test     # pruebas con Vitest
```

### Almacenamiento

- **Local (por defecto):** las propuestas se guardan en memoria y se
  espejan en `./.data/proposals.json` (ignorado por git). Sobrevive a
  reinicios locales.
- **Vercel KV:** si existen las variables `KV_REST_API_URL` y
  `KV_REST_API_TOKEN`, se usa KV automáticamente. El paquete `@vercel/kv`
  es una dependencia opcional: instálalo (`npm install @vercel/kv`) solo si
  vas a usar KV.
- La interfaz (`saveProposal`, `getProposal`, `listProposals`,
  `saveVersion`) es estable: más adelante se cambiará el backend a Postgres
  sin tocar la UI.

## Cómo cargar una propuesta

1. Entra a **`/consultor/nueva`**.
2. Pega el contenido de `propuesta.json` en el área de texto **o** sube el
   archivo `.json`.
3. Pulsa **«Cargar propuesta»**.
4. Se **valida la estructura antes de renderizar nada**. Si algo falla, se
   listan **todos** los problemas a la vez, en español, nombrando el bloque
   exacto.
5. Si es válida, se persiste con un id generado y versión `v1`, y se muestra
   una tarjeta de resumen (cliente, modo, nota, componentes por plan y los
   tres precios de lista) más un botón hacia la vista de presentación
   (enlace muerto por ahora).

El listado de propuestas cargadas está en **`/consultor`**.

Puedes probar con el fixture incluido:
`fixtures/propuesta-activos-v1.json`.

## Qué exige el contrato (`propuesta.json`)

La validación vive en `lib/validateProposal.ts` (función pura que devuelve
`{ ok, errors }`). Bloques requeridos:

| Bloque | Requisito |
| --- | --- |
| `cliente`, `titular`, `resumen` | texto no vacío |
| `modo` | `"A"` o `"B"` |
| `as_is` | `de_donde_llegan`, `por_donde_pasan`, `donde_queda`: arreglos de pares `[etiqueta, nota]` |
| `fugas` | arreglo; **exactamente una** con `dominante: true`; cada una con `id`, `titulo`, `estado` (`activa`/`mitigable`/`fuera_de_alcance`), `cuantificacion.valor`; las `mitigable` requieren `depende_de_tercero` |
| `madurez` | **exactamente 7** ítems, cada uno con `m`, `hoy` (0–4), `por_que`, `p` (planes `"1"`/`"2"`/`"3"` → 0–4) |
| `nota` | `{ puntos: 0–100, letra: A–F }` |
| `componentes` | objeto por id; cada valor con `nombre_cliente`, `plan` (`fundamental`/`avanzado`/`inteligente`), `instancias` (entero ≥ 1), `vis` (`front`/`back`/`ambos`), `journey` (número); `cuota` opcional |
| `no_aplican` | pares `[nombre, razon]`; se rechaza si `nombre` tiene forma de id interno (palabras en minúscula unidas por guiones) |
| `integraciones` | `[nombre, nota, etiqueta]` con etiqueta en `incluido`/`consumo_variable`/`licencia_del_cliente`/`desarrollo_a_cotizar` |
| `multiplicador_calculado` | claves `"1"`/`"2"`/`"3"`, cada una `{ piezas, config }` |
| `condicion_comercial` | `{ moneda, base_por_plan, tramos_factor, precio_por_plan (enteros), limite_descuento_sin_aprobacion (0–1) }` |
| `plan_recomendado` | `{ plan: 1\|2\|3, por_que }` |
| `advertencias` | arreglo de textos |

## Reglas duras (`lib/rules.ts`)

1. **Nunca** se renderizan: ids internos de componentes (patrón en minúscula
   con guiones), las palabras `esfuerzo`, `jornadas`, `multiplicador`, ni la
   fórmula de precio. `forbiddenContentCheck(html)` escanea la salida
   renderizada en busca de estos patrones.
2. Los precios se muestran como enteros limpios con moneda, en locale
   `es-CO` (p. ej. `$2.070 USD`).
3. Toda pantalla que el cliente llegue a ver vivirá bajo **`/p/`** (aún no
   existe ninguna); las rutas del consultor viven bajo **`/consultor/`**.
   Esta separación es contractual: el documento del cliente es una respuesta
   **distinta**, nunca la misma página con controles ocultos.

## Lenguaje visual

Definido como variables CSS en `app/globals.css`: fondo blanco, morado
principal `#485CC7`, morado oscuro `#232A45` para titulares, lima `#CCFF33`
solo para acentos pequeños, gris `#6B7280` para texto secundario, ámbar
`#F59E0B` para advertencias de terceros. Estilo editorial sobrio, mucho aire,
tipografía de sistema. Sin estética de dashboard.

## Pruebas

```bash
npm run test
```

- `validateProposal`: acepta el fixture; lo rechaza al quitar `nota`, al
  marcar dos fugas como dominantes, cuando un `no_aplican` expone un id
  interno, y cuando un precio no es entero.
- `forbiddenContentCheck`: atrapa una cadena con `gestion-base-contactos`,
  las palabras prohibidas y la fórmula de precio.
- `formatPrice`: formatea enteros limpios en locale `es-CO`.

## Estructura

```
app/
  layout.tsx, globals.css, page.tsx        # raíz → /consultor
  consultor/page.tsx                        # Pantalla 2: listado
  consultor/nueva/page.tsx                  # Pantalla 1: intake + validación
  consultor/[id]/presentacion/page.tsx      # placeholder (prompt 2)
  api/proposals/route.ts                    # POST guarda, GET lista
lib/
  types.ts                                  # contrato de propuesta.json
  validateProposal.ts                       # validación pura
  rules.ts                                  # reglas duras + forbiddenContentCheck
  storage.ts                                # abstracción de almacenamiento
fixtures/propuesta-activos-v1.json          # fixture de prueba (reemplazable)
tests/                                       # pruebas Vitest
```
