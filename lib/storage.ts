/**
 * Storage abstraction for proposals. SERVER-SIDE ONLY.
 *
 * The interface is deliberately small and backend-agnostic:
 *   { saveProposal, getProposal, listProposals, saveVersion }
 *
 * Today it runs on Vercel KV when configured, otherwise an in-memory Map
 * backed by a JSON file for local dev. Tomorrow we swap the backend to
 * Postgres without touching a single line of UI code — the UI only ever
 * sees this interface and the `StoredProposal` shape.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type {
  Proposal,
  StoredProposal,
  SentVersion,
  AppliedCondition,
  ClientDocument,
  Acceptance,
} from "./types";

/** What the send flow supplies; storage assigns version, sentAt and token. */
export interface SentVersionInput {
  plan: 1 | 2 | 3;
  autor: string;
  aprobador: string | null;
  motivo: string | null;
  condicion: AppliedCondition;
  clientDocument: ClientDocument;
}

/** A token resolved to its owning proposal and frozen version. */
export interface TokenResolution {
  proposal: StoredProposal;
  sentVersion: SentVersion;
}

export interface ProposalStorage {
  /** Persist a fresh proposal as version "v1". Returns the stored record. */
  saveProposal(data: Proposal): Promise<StoredProposal>;
  /** Fetch the current head record for an id, or null if unknown. */
  getProposal(id: string): Promise<StoredProposal | null>;
  /** All stored proposals (head records), newest first. */
  listProposals(): Promise<StoredProposal[]>;
  /** Save a new version of an existing proposal; bumps the version tag. */
  saveVersion(id: string, data: Proposal): Promise<StoredProposal>;
  /** Freeze and store an immutable sent version; returns it with its token. */
  saveSentVersion(id: string, input: SentVersionInput): Promise<SentVersion>;
  /** Resolve a share token to its frozen version, or null. */
  getByToken(token: string): Promise<TokenResolution | null>;
  /**
   * Record the client's acceptance of a version. Rejects a second accept on
   * the same version server-side (never just hidden in the UI).
   */
  aceptarVersion(token: string, acceptance: Acceptance): Promise<AcceptResult>;
}

export type AcceptResult =
  | { ok: true; sentVersion: SentVersion }
  | { ok: false; reason: "not_found" | "already_accepted" };

// --- helpers ------------------------------------------------------------

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cliente";
}

function generateId(cliente: string): string {
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${slugify(cliente)}-${suffix}`;
}

function nextVersion(current: string): string {
  const n = parseInt(String(current).replace(/[^0-9]/g, ""), 10);
  return `v${Number.isFinite(n) ? n + 1 : 2}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** A crypto-strength, url-safe token (24 chars from 18 random bytes). */
function generateToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

function newRecord(id: string, data: Proposal, version: string): StoredProposal {
  return {
    id,
    cliente: data.cliente,
    version,
    createdAt: nowIso(),
    estado: "borrador",
    data,
    sentVersions: [],
  };
}

/** Build the next immutable sent version from the input and current history. */
function buildSentVersion(
  existing: StoredProposal,
  input: SentVersionInput,
): SentVersion {
  return {
    version: `v${existing.sentVersions.length + 1}`,
    token: generateToken(),
    sentAt: nowIso(),
    plan: input.plan,
    autor: input.autor,
    aprobador: input.aprobador,
    motivo: input.motivo,
    condicion: input.condicion,
    clientDocument: input.clientDocument,
    estado: "enviada",
    acceptance: null,
  };
}

// --- in-memory + JSON file backend --------------------------------------

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "proposals.json");

/**
 * Local-dev backend. The Map is the source of truth within a process; the
 * JSON file is a best-effort mirror so data survives restarts locally. On a
 * read-only filesystem (e.g. serverless without KV) the file writes fail
 * silently and we degrade to memory-only, which is fine for a foundation.
 */
class MemoryFileStorage implements ProposalStorage {
  private map = new Map<string, StoredProposal>();
  private loaded = false;

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as StoredProposal[];
      for (const rec of parsed) {
        // Tolerate records written before sent versions / acceptance existed.
        if (!Array.isArray(rec.sentVersions)) rec.sentVersions = [];
        for (const v of rec.sentVersions) {
          if (!v.estado) v.estado = "enviada";
          if (v.acceptance === undefined) v.acceptance = null;
        }
        this.map.set(rec.id, rec);
      }
    } catch {
      // No file yet, or unreadable: start empty.
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const all = Array.from(this.map.values());
      await fs.writeFile(DATA_FILE, JSON.stringify(all, null, 2), "utf8");
    } catch {
      // Read-only filesystem: keep going with memory only.
    }
  }

  async saveProposal(data: Proposal): Promise<StoredProposal> {
    await this.load();
    const id = generateId(data.cliente);
    const rec = newRecord(id, data, "v1");
    this.map.set(id, rec);
    await this.persist();
    return rec;
  }

  async getProposal(id: string): Promise<StoredProposal | null> {
    await this.load();
    return this.map.get(id) ?? null;
  }

  async listProposals(): Promise<StoredProposal[]> {
    await this.load();
    return Array.from(this.map.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async saveVersion(id: string, data: Proposal): Promise<StoredProposal> {
    await this.load();
    const existing = this.map.get(id);
    if (!existing) throw new Error(`Propuesta no encontrada: ${id}`);
    const rec: StoredProposal = {
      ...existing,
      cliente: data.cliente,
      version: nextVersion(existing.version),
      createdAt: nowIso(),
      data,
    };
    this.map.set(id, rec);
    await this.persist();
    return rec;
  }

  async saveSentVersion(
    id: string,
    input: SentVersionInput,
  ): Promise<SentVersion> {
    await this.load();
    const existing = this.map.get(id);
    if (!existing) throw new Error(`Propuesta no encontrada: ${id}`);
    const sent = buildSentVersion(existing, input);
    // Immutable append; sent snapshots are never mutated afterwards.
    existing.sentVersions = [...existing.sentVersions, sent];
    existing.estado = "enviada";
    this.map.set(id, existing);
    await this.persist();
    return sent;
  }

  async getByToken(token: string): Promise<TokenResolution | null> {
    await this.load();
    for (const proposal of this.map.values()) {
      const sentVersion = proposal.sentVersions.find((v) => v.token === token);
      if (sentVersion) return { proposal, sentVersion };
    }
    return null;
  }

  async aceptarVersion(
    token: string,
    acceptance: Acceptance,
  ): Promise<AcceptResult> {
    await this.load();
    for (const proposal of this.map.values()) {
      const sentVersion = proposal.sentVersions.find((v) => v.token === token);
      if (!sentVersion) continue;
      if (sentVersion.estado === "aceptada") {
        return { ok: false, reason: "already_accepted" };
      }
      sentVersion.estado = "aceptada";
      sentVersion.acceptance = acceptance;
      proposal.estado = "aceptada";
      await this.persist();
      return { ok: true, sentVersion };
    }
    return { ok: false, reason: "not_found" };
  }
}

// --- Vercel KV backend --------------------------------------------------

const KV_INDEX = "proposals:index";
const kvKey = (id: string) => `proposal:${id}`;
const kvTokenKey = (token: string) => `ptoken:${token}`;

// Non-literal specifier so the type checker and bundler never try to resolve
// this optional dependency at build time. It is imported at runtime only when
// KV is actually configured (see isKvConfigured).
const KV_MODULE = "@vercel/kv";

/**
 * Vercel KV backend, used only when KV env vars are present. `@vercel/kv` is
 * an optional dependency: the import is marked webpackIgnore so the bundler
 * never tries to resolve it when it isn't installed, and this class is only
 * ever constructed when KV is actually configured.
 */
/** The slice of the @vercel/kv client this backend actually uses. */
interface KvClient {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<unknown>;
  sadd: (k: string, v: string) => Promise<unknown>;
  smembers: (k: string) => Promise<string[]>;
}

class KvStorage implements ProposalStorage {
  private clientPromise: Promise<KvClient>;

  constructor() {
    this.clientPromise = import(/* webpackIgnore: true */ KV_MODULE).then(
      (m: { kv: KvClient }) => m.kv,
    );
  }

  async saveProposal(data: Proposal): Promise<StoredProposal> {
    const kv = await this.clientPromise;
    const id = generateId(data.cliente);
    const rec = newRecord(id, data, "v1");
    await kv.set(kvKey(id), rec);
    await kv.sadd(KV_INDEX, id);
    return rec;
  }

  async getProposal(id: string): Promise<StoredProposal | null> {
    const kv = await this.clientPromise;
    return ((await kv.get(kvKey(id))) as StoredProposal | null) ?? null;
  }

  async listProposals(): Promise<StoredProposal[]> {
    const kv = await this.clientPromise;
    const ids = await kv.smembers(KV_INDEX);
    const records = await Promise.all(ids.map((id) => this.getProposal(id)));
    return records
      .filter((r): r is StoredProposal => r !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveVersion(id: string, data: Proposal): Promise<StoredProposal> {
    const kv = await this.clientPromise;
    const existing = await this.getProposal(id);
    if (!existing) throw new Error(`Propuesta no encontrada: ${id}`);
    const rec: StoredProposal = {
      ...existing,
      cliente: data.cliente,
      version: nextVersion(existing.version),
      createdAt: nowIso(),
      data,
    };
    await kv.set(kvKey(id), rec);
    return rec;
  }

  async saveSentVersion(
    id: string,
    input: SentVersionInput,
  ): Promise<SentVersion> {
    const kv = await this.clientPromise;
    const existing = await this.getProposal(id);
    if (!existing) throw new Error(`Propuesta no encontrada: ${id}`);
    if (!Array.isArray(existing.sentVersions)) existing.sentVersions = [];
    const sent = buildSentVersion(existing, input);
    existing.sentVersions = [...existing.sentVersions, sent];
    existing.estado = "enviada";
    await kv.set(kvKey(id), existing);
    // Token index → { id, version } so tokens resolve in O(1).
    await kv.set(kvTokenKey(sent.token), { id, version: sent.version });
    return sent;
  }

  async getByToken(token: string): Promise<TokenResolution | null> {
    const kv = await this.clientPromise;
    const ref = (await kv.get(kvTokenKey(token))) as
      | { id: string; version: string }
      | null;
    if (!ref) return null;
    const proposal = await this.getProposal(ref.id);
    if (!proposal) return null;
    const sentVersion = proposal.sentVersions.find((v) => v.token === token);
    return sentVersion ? { proposal, sentVersion } : null;
  }

  async aceptarVersion(
    token: string,
    acceptance: Acceptance,
  ): Promise<AcceptResult> {
    const kv = await this.clientPromise;
    const resolved = await this.getByToken(token);
    if (!resolved) return { ok: false, reason: "not_found" };
    const { proposal } = resolved;
    const sentVersion = proposal.sentVersions.find((v) => v.token === token)!;
    if (sentVersion.estado === "aceptada") {
      return { ok: false, reason: "already_accepted" };
    }
    sentVersion.estado = "aceptada";
    sentVersion.acceptance = acceptance;
    proposal.estado = "aceptada";
    await kv.set(kvKey(proposal.id), proposal);
    return { ok: true, sentVersion };
  }
}

// --- backend selection --------------------------------------------------

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

let instance: ProposalStorage | null = null;

/** The process-wide storage instance, chosen once by environment. */
export function getStorage(): ProposalStorage {
  if (!instance) {
    instance = isKvConfigured() ? new KvStorage() : new MemoryFileStorage();
  }
  return instance;
}

export const storage: ProposalStorage = {
  saveProposal: (data) => getStorage().saveProposal(data),
  getProposal: (id) => getStorage().getProposal(id),
  listProposals: () => getStorage().listProposals(),
  saveVersion: (id, data) => getStorage().saveVersion(id, data),
  saveSentVersion: (id, input) => getStorage().saveSentVersion(id, input),
  getByToken: (token) => getStorage().getByToken(token),
  aceptarVersion: (token, acceptance) =>
    getStorage().aceptarVersion(token, acceptance),
};
