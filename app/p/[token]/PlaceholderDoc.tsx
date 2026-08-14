/**
 * Minimal client-document placeholder (prompt 3). Pure component: takes the
 * frozen client document and renders the client name, plan and the effective
 * price block. No storage, no CSS import — so it can be server-rendered in
 * tests to prove it never leaks forbidden content and never mentions a
 * discount that does not exist.
 */

import { bloquePrecioEfectivo } from "@/lib/condition";
import { formatPrice } from "@/lib/rules";
import { PLAN_LABEL } from "@/lib/mapLayout";
import type { ClientDocument } from "@/lib/types";

export default function PlaceholderDoc({
  clientDocument,
  now = new Date(),
}: {
  clientDocument: ClientDocument;
  now?: Date;
}) {
  const ca = clientDocument.condicion_aplicada;
  const bloque = bloquePrecioEfectivo(
    {
      descuentoPct: ca.descuento_pct,
      vigencia: ca.vigencia,
      precioLista: ca.precio_lista_seleccionado,
      precioFinal: ca.precio_final_seleccionado,
      lineaCondicion: ca.linea_condicion,
      moneda: ca.moneda,
    },
    now,
  );

  return (
    <div className="p-card">
      <p className="p-cliente">{clientDocument.cliente}</p>
      <h1 className="p-title">Plan {PLAN_LABEL[ca.plan_seleccionado]}</h1>

      <div className="p-price-block">
        {bloque.tieneDescuento ? (
          <>
            <div className="p-price-strike">
              {formatPrice(bloque.precioLista, bloque.moneda)}
            </div>
            <div className="p-price-final">
              {formatPrice(bloque.precioMostrar, bloque.moneda)}
            </div>
            {bloque.lineaCondicion && (
              <div className="p-price-line">{bloque.lineaCondicion}</div>
            )}
          </>
        ) : (
          <div className="p-price-final">
            {formatPrice(bloque.precioMostrar, bloque.moneda)}
          </div>
        )}
      </div>

      <p className="p-construccion">Documento en construcción</p>
    </div>
  );
}
