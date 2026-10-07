// Thin client for the Solami Blur data API: REST lookups plus the live decoded-event stream.
// Docs: https://solami.dev/docs/blur
import { config } from "./config.ts";

// Blur sends every fractional value as a decimal string. Parse once, here.
export function dec(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function decOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

async function request<T>(method: "GET" | "POST", path: string, params: Record<string, string | number | boolean>, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const url = new URL(path, config.apiBase);
  url.searchParams.set("chain", "solana");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("api_key", config.apiKey);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { "x-api-key": config.apiKey, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return (await res.json()) as T;
    // 502 means "the query failed, retry"; 429 is a rate limit.
    if ((res.status === 502 || res.status === 429) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Solami ${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
}

// ---- Raw shapes (only the fields we use) ----

export type RawSwap = {
  signature: string;
  slot: number;
  block_time: number;
  dex: string;
  pool: string;
  mint: string;
  side: "buy" | "sell";
  trader: string;
  price_usd: string;
  volume_usd: string;
  price_impact_pct: string;
  name?: string | null;
  symbol?: string | null;
  image?: string | null;
  trader_tags?: string[];
};

type RawBalance = {
  sol: { ui_amount: string; value_usd: string | null };
  tokens: { mint: string; symbol?: string; ui_amount: string; value_usd?: string }[];
  total_value_usd: string | null;
};

type RawPnl = {
  total_usd: string;
  roi_pct: string;
  wins: number;
  losses: number;
  tokens_traded: number;
  summary?: { total_value_usd?: string };
  tags?: string[];
};

type RawFunding = {
  wallet: string;
  resolved: boolean;
  first_funder: string | null;
  first_funded_time: number | null;
};

type RawMetadata = { address: string; name: string; symbol: string; image: string | null };

// ---- REST ----

export function largeTrades(minVolumeUsd: number, windowSecs = 3600, limit = 100): Promise<RawSwap[]> {
  return request("GET", "/data/trades/large", { min_volume_usd: minVolumeUsd, window: windowSecs, limit });
}

export async function walletBalance(address: string) {
  const r = await request<RawBalance>("GET", "/data/wallet/balance", { address, enrich: true, limit: 100 });
  return {
    solBalance: decOrNull(r.sol?.ui_amount),
    totalUsd: decOrNull(r.total_value_usd),
    holdings: (r.tokens ?? [])
      .map((t) => ({ symbol: t.symbol || t.mint.slice(0, 4) + "…", valueUsd: dec(t.value_usd) }))
      .filter((t) => t.valueUsd > 0)
      .sort((a, b) => b.valueUsd - a.valueUsd),
  };
}

export async function walletPnl(address: string) {
  const r = await request<RawPnl>("GET", "/data/wallet/pnl", { address, positions: false });
  return {
    pnlUsd: decOrNull(r.total_usd),
    roiPct: decOrNull(r.roi_pct),
    wins: r.wins ?? null,
    losses: r.losses ?? null,
    tokensTraded: r.tokens_traded ?? null,
    tags: r.tags ?? [],
  };
}

export async function walletFunding(address: string) {
  // A full ledger walk on Solami's side; busy wallets take a minute or more.
  const [r] = await request<RawFunding[]>("GET", "/data/wallet/funding", { address }, undefined, 120_000);
  if (!r?.resolved) return null;
  return { firstFunder: r.first_funder || null, fundedAt: r.first_funded_time };
}

export function tokenMetadata(mints: string[]): Promise<RawMetadata[]> {
  return request("POST", "/data/token/metadata", {}, { chain: "solana", addresses: mints.slice(0, 1000) });
}

// ---- Live stream ----

type StreamOptions = {
  filter: Record<string, string | number>;
  onSwap: (s: RawSwap) => void;
  onStatus?: (status: "open" | "closed", detail?: string) => void;
};

// Opens wss://ws.solami.dev/data/subscribe and keeps it open: reconnects with backoff,
// and stops for good if Solami says we're out of bandwidth (4002) or the key is bad.
export function stream({ filter, onSwap, onStatus }: StreamOptions): { close: () => void } {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = 1000;

  const connect = () => {
    const url = new URL("/data/subscribe", config.wsBase);
    url.searchParams.set("chain", "solana");
    url.searchParams.set("api_key", config.apiKey);
    url.searchParams.set("metadata", "false");
    for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, String(v));

    ws = new WebSocket(url);
    ws.onopen = () => {
      backoff = 1000;
      onStatus?.("open");
    };
    ws.onmessage = (msg) => {
      let e: { type?: string };
      try {
        e = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      // Unknown event types are ignored, so new ones never break us.
      if (e.type === "swap") onSwap(e as RawSwap);
    };
    ws.onclose = (ev) => {
      onStatus?.("closed", `${ev.code} ${ev.reason}`);
      if (stopped) return;
      if (ev.code === 4002 || ev.code === 4001 || ev.code === 1008) {
        console.error(`[stream] closed with ${ev.code} (${ev.reason || "auth/bandwidth"}), not reconnecting`);
        return;
      }
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
    ws.onerror = () => {
      // onclose follows and handles the reconnect
    };
  };

  connect();
  return {
    close: () => {
      stopped = true;
      ws?.close();
    },
  };
}
