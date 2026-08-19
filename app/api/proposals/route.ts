import { NextResponse } from "next/server";
import { validateProposal } from "@/lib/validateProposal";
import { storage } from "@/lib/storage";
import type { Proposal } from "@/lib/types";

// This route touches the storage backend and must not be statically cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/proposals — a SLIM list of stored proposals (newest first), just
 * what the intake needs to offer "associate as a new version of an existing
 * client". Deliberately omits `data` and `sentVersions` so no internal field
 * (e.g. a version's `motivo`) ever reaches the browser.
 */
export async function GET() {
  const proposals = await storage.listProposals();
  const list = proposals.map((p) => ({
    id: p.id,
    cliente: p.cliente,
    marca: p.marca ?? null,
    version: p.version,
    createdAt: p.createdAt,
    sentCount: p.sentVersions.length,
  }));
  return NextResponse.json({ proposals: list });
}

/**
 * PATCH /api/proposals?id=<id> — correct the brand name on a proposal.
 * Body: { marca: string | null }.
 */
export async function PATCH(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, errors: ["Falta el parámetro «id»."] },
      { status: 400 },
    );
  }
  let body: { marca?: unknown };
  try {
    body = (await request.json()) as { marca?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, errors: ["El cuerpo de la petición no es un JSON válido."] },
      { status: 400 },
    );
  }
  const marca =
    typeof body.marca === "string" && body.marca.trim() !== ""
      ? body.marca.trim()
      : null;
  const existing = await storage.getProposal(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, errors: [`No existe una propuesta con id «${id}».`] },
      { status: 404 },
    );
  }
  const updated = await storage.setMarca(id, marca);
  return NextResponse.json({ ok: true, marca: updated.marca ?? null });
}

/**
 * POST /api/proposals — validate and persist a proposal.
 * Body: the raw propuesta.json object.
 * Re-validates server-side (never trust the client) before storing.
 *
 * With `?version_of=<id>`, the upload is stored as a NEW VERSION of that
 * existing proposal (bumps v1→v2…, keeps its sent-version history) instead of
 * creating a new record.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: ["El cuerpo de la petición no es un JSON válido."] },
      { status: 400 },
    );
  }

  const result = validateProposal(body);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errors: result.errors },
      { status: 400 },
    );
  }

  const params = new URL(request.url).searchParams;
  const versionOf = params.get("version_of");
  if (versionOf) {
    const existing = await storage.getProposal(versionOf);
    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          errors: [
            `No existe una propuesta con id «${versionOf}» para asociar como versión nueva.`,
          ],
        },
        { status: 404 },
      );
    }
    const stored = await storage.saveVersion(versionOf, body as Proposal);
    return NextResponse.json(
      { ok: true, proposal: stored, asVersion: true },
      { status: 201 },
    );
  }

  const marcaParam = params.get("marca");
  const marca = marcaParam && marcaParam.trim() !== "" ? marcaParam.trim() : null;
  const stored = await storage.saveProposal(body as Proposal, marca);
  return NextResponse.json({ ok: true, proposal: stored }, { status: 201 });
}
