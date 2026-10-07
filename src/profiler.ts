// Builds a "who is this wallet?" profile from three Solami lookups (balance, pnl, funding)
// and classifies it. Results are cached so a busy whale doesn't cost a lookup per trade.
import * as solami from "./solami.ts";
import { lookup } from "./labels.ts";
import type { WalletKind, WalletProfile } from "./types.ts";

const TTL_MS = 10 * 60_000;
const cache = new Map<string, WalletProfile>();
const inflight = new Map<string, Promise<WalletProfile>>();

export function classify(p: Omit<WalletProfile, "kind">): WalletKind {
  const known = lookup(p.address);
  if (known) return known.kind;
  const tags = new Set(p.tags);
  if (tags.has("bot") || tags.has("sniper")) return "bot";
  if (tags.has("pro_trader")) return "pro-trader";
  if ((p.portfolioUsd ?? 0) >= 1_000_000) return "whale";
  if (tags.has("fresh") || (p.fundedAt && Date.now() / 1000 - p.fundedAt < 7 * 86400)) return "fresh";
  const trades = (p.wins ?? 0) + (p.losses ?? 0);
  if (trades >= 20 && (p.wins ?? 0) / trades >= 0.6 && (p.pnlUsd ?? 0) > 50_000) return "pro-trader";
  if ((p.portfolioUsd ?? 0) >= 250_000) return "whale";
  if ((p.tokensTraded ?? 0) > 0) return "trader";
  return "unknown";
}

async function build(address: string, extraTags: string[]): Promise<WalletProfile> {
  // Each lookup is independent and some are beta; one failing shouldn't sink the profile.
  // Funding is slow (a full ledger walk, often 60s+ for busy wallets), so it's filled in later by fillFunding().
  const [balance, pnl] = await Promise.allSettled([solami.walletBalance(address), solami.walletPnl(address)]);
  const b = balance.status === "fulfilled" ? balance.value : null;
  const p = pnl.status === "fulfilled" ? pnl.value : null;
  for (const r of [balance, pnl]) {
    if (r.status === "rejected") console.warn(`[profile] ${address.slice(0, 6)}…: ${r.reason?.message ?? r.reason}`);
  }

  const base = {
    address,
    entity: lookup(address)?.entity ?? null,
    tags: [...new Set([...(p?.tags ?? []), ...extraTags])],
    portfolioUsd: b?.totalUsd ?? null,
    solBalance: b?.solBalance ?? null,
    topHoldings: b?.holdings.slice(0, 5) ?? [],
    pnlUsd: p?.pnlUsd ?? null,
    roiPct: p?.roiPct ?? null,
    wins: p?.wins ?? null,
    losses: p?.losses ?? null,
    tokensTraded: p?.tokensTraded ?? null,
    firstFunder: null,
    firstFunderEntity: null,
    fundedAt: null,
    updatedAt: Date.now(),
  };
  return { ...base, kind: classify(base) };
}

export function getProfile(address: string, extraTags: string[] = []): Promise<WalletProfile> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.updatedAt < TTL_MS) return Promise.resolve(hit);
  const pending = inflight.get(address);
  if (pending) return pending;

  const job = limit(() => build(address, extraTags))
    .then((profile) => {
      cache.set(address, profile);
      fillFunding(profile);
      return profile;
    })
    .finally(() => inflight.delete(address));
  inflight.set(address, job);
  return job;
}

// At most a few lookups in flight, so a burst of whale trades (or the startup backfill) can't swamp the API.
function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
const limit = limiter(4);
const fundingLimit = limiter(2);
const fundingTried = new Set<string>();

let onUpdate: (p: WalletProfile) => void = () => {};
export function onProfileUpdate(fn: (p: WalletProfile) => void) {
  onUpdate = fn;
}

// Background: who first funded this wallet. Re-classifies (a recently funded wallet is "fresh") and republishes.
function fillFunding(profile: WalletProfile) {
  if (fundingTried.has(profile.address)) return;
  fundingTried.add(profile.address);
  fundingLimit(() => solami.walletFunding(profile.address))
    .then((f) => {
      if (!f?.firstFunder) return;
      const current = cache.get(profile.address) ?? profile;
      const base = { ...current, firstFunder: f.firstFunder, firstFunderEntity: lookup(f.firstFunder)?.entity ?? null, fundedAt: f.fundedAt };
      const updated = { ...base, kind: classify(base) };
      cache.set(profile.address, updated);
      onUpdate(updated);
    })
    .catch((e) => console.warn(`[funding] ${profile.address.slice(0, 6)}…: ${(e as Error).message}`));
}

export function cachedProfile(address: string): WalletProfile | undefined {
  return cache.get(address);
}

export function seedProfile(profile: WalletProfile) {
  cache.set(profile.address, profile);
}
