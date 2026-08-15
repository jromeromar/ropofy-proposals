/**
 * Seed script — `npm run seed`.
 *
 * Loads the Activos fixture through the real intake path (validate → store),
 * then sends two versions and adds telemetry + an acceptance so a fresh deploy
 * has one complete expediente to explore. Uses the storage abstraction, so it
 * persists to Vercel KV when configured (otherwise to the local .data file).
 */

import { readFileSync } from "fs";
import path from "path";
import { validateProposal } from "../lib/validateProposal";
import { storage, hashData } from "../lib/storage";
import { construirCondicion, buildClientDocument } from "../lib/clientDocument";

const H = 3600 * 1000;
const D = 24 * H;
const haceHoras = (h: number) => new Date(Date.now() - h * H).toISOString();
const enDias = (d: number) => new Date(Date.now() + d * D).toISOString();

const UA_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile Safari/604";
const UA_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function main() {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  const data = JSON.parse(raw);

  // Real intake path: validate before storing.
  const v = validateProposal(data);
  if (!v.ok) {
    console.error("Fixture inválido — no se sembró nada:");
    for (const e of v.errors) console.error("  •", e);
    process.exit(1);
  }

  const stored = await storage.saveProposal(data);

  // v1: sent with a live 15% discount + telemetry that triggers the signal.
  const c1 = construirCondicion(stored.data, 2, {
    descuentoPct: 15,
    vigencia: enDias(30),
    autor: "Ana Consultora",
    aprobador: null,
  });
  const s1 = await storage.saveSentVersion(stored.id, {
    plan: 2,
    autor: "Ana Consultora",
    aprobador: null,
    motivo: "seed",
    condicion: c1,
    clientDocument: buildClientDocument(stored.data, c1, 2),
    sourceHash: hashData(stored.data),
  });
  await storage.registrarEvento(s1.token, {
    tipo: "abierto",
    at: haceHoras(30),
    userAgent: UA_MAC,
  });
  await storage.registrarEvento(s1.token, {
    tipo: "plan_cambiado",
    at: haceHoras(30),
    planVisto: 3,
  });
  await storage.registrarEvento(s1.token, {
    tipo: "tiempo_en_pagina",
    at: haceHoras(30),
    seconds: 360,
  });
  await storage.registrarEvento(s1.token, {
    tipo: "abierto",
    at: haceHoras(6),
    userAgent: UA_IPHONE,
  });

  // v2: sent without discount, then accepted — shows the acceptance record.
  const c2 = construirCondicion(stored.data, 2, {
    descuentoPct: null,
    vigencia: null,
    autor: "Ana Consultora",
    aprobador: null,
  });
  const s2 = await storage.saveSentVersion(stored.id, {
    plan: 2,
    autor: "Ana Consultora",
    aprobador: null,
    motivo: "seed",
    condicion: c2,
    clientDocument: buildClientDocument(stored.data, c2, 2),
    sourceHash: hashData(stored.data),
  });
  await storage.registrarEvento(s2.token, {
    tipo: "abierto",
    at: haceHoras(2),
    userAgent: UA_WIN,
  });
  await storage.aceptarVersion(s2.token, {
    at: haceHoras(1),
    nombre: "Carla Decisora",
    correo: "carla@activos.co",
    observaciones: "Nos interesa arrancar en septiembre.",
    plan: 2,
    precioEfectivo: 4080,
    moneda: "USD",
    ip: "190.0.0.1",
    userAgent: UA_WIN,
  });

  console.log("Seed listo ✓");
  console.log(`  Expediente:      /consultor/${stored.id}`);
  console.log(`  Documento v1:    /p/${s1.token}`);
  console.log(`  Documento v2:    /p/${s2.token}  (aceptada)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
