// The pipeline: Solami swap events -> normalized trades -> token names -> wallet profiles -> feed + alerts.
import * as store from "./store.ts";
import { alert } from "./telegram.ts";
import { dec, type RawSwap } from "./solami.ts";
import type { WalletProfile, WhaleTrade } from "./types.ts";

type Deps = {
  getProfile: (address: string, tags: string[]) => Promise<WalletProfile>;
  fetchMetadata: (mints: string[]) => Promise<{ address: string; name: string; symbol: string; image: string | null }[]>;
  watchlist: Set<string>;
};

export function createRadar({ getProfile, fetchMetadata, watchlist }: Deps) {
  const tokens = new Map<string, { symbol: string | null; name: string | null; image: string | null }>();
  const pendingMints = new Set<string>();
  let metaTimer: NodeJS.Timeout | null = null;

  // Stream swaps don't carry token names; batch the unknown mints into one lookup.
  const queueMetadata = (mint: string) => {
    if (tokens.has(mint) || pendingMints.has(mint)) return;
    pendingMints.add(mint);
    metaTimer ??= setTimeout(async () => {
      metaTimer = null;
      const mints = [...pendingMints];
      pendingMints.clear();
      try {
        for (const m of await fetchMetadata(mints)) {
          const meta = { symbol: m.symbol || null, name: m.name || null, image: m.image || null };
          tokens.set(m.address, meta);
          store.updateTradeMeta(m.address, meta);
        }
      } catch (e) {
        console.warn(`[metadata] ${(e as Error).message}`);
      }
    }, 750);
  };

  const ingest = (raw: RawSwap, opts: { alert: boolean }) => {
    const meta = tokens.get(raw.mint);
    const trade: WhaleTrade = {
      signature: raw.signature,
      slot: raw.slot,
      blockTime: raw.block_time,
      dex: raw.dex,
      pool: raw.pool,
      mint: raw.mint,
      symbol: raw.symbol ?? meta?.symbol ?? null,
      name: raw.name ?? meta?.name ?? null,
      image: raw.image ?? meta?.image ?? null,
      side: raw.side,
      trader: raw.trader,
      volumeUsd: dec(raw.volume_usd),
      priceUsd: dec(raw.price_usd),
      priceImpactPct: dec(raw.price_impact_pct),
      traderTags: raw.trader_tags ?? [],
      watched: watchlist.has(raw.trader),
    };
    if (raw.symbol) tokens.set(raw.mint, { symbol: raw.symbol, name: raw.name ?? null, image: raw.image ?? null });
    if (!store.addTrade(trade)) return;
    if (!trade.symbol) queueMetadata(trade.mint);

    getProfile(trade.trader, trade.traderTags)
      .then((p) => {
        store.publishProfile(p);
        if (opts.alert) alert(trade, p);
      })
      .catch((e) => {
        console.warn(`[profile] ${(e as Error).message}`);
        if (opts.alert) alert(trade, undefined);
      });
  };

  return { ingest };
}
