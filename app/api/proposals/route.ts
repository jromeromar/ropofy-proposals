import { NextResponse } from "next/server";
import { validateProposal } from "@/lib/validateProposal";
import { storage } from "@/lib/storage";
import type { Proposal } from "@/lib/types";

// This route touches the storage backend and must not be statically cached.
export const dynamic = "force-dynamic";

/** GET /api/proposals — list stored proposals (head records, newest first). */
export async function GET() {
  const proposals = await storage.listProposals();
  return NextResponse.json({ proposals });
}

/**
 * POST /api/proposals — validate and persist a proposal.
 * Body: the raw propuesta.json object.
 * Re-validates server-side (never trust the client) before storing.
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

  const stored = await storage.saveProposal(body as Proposal);
  return NextResponse.json({ ok: true, proposal: stored }, { status: 201 });
}
