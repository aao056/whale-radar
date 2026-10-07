// In-memory state: the recent trade feed plus rolling aggregates the dashboard shows.
import { EventEmitter } from "node:events";
import type { WalletProfile, WhaleTrade } from "./types.ts";

const MAX_TRADES = 500;

// SOL and stablecoins are on one side of almost every trade, so they'd dominate the "money flow"
// panel without saying anything. Leave them out of it (they still show in the feed).
const FLOW_EXCLUDED = new Set([
  "So11111111111111111111111111111111111111112", // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);
const STABLE_SYMBOLS = /^(USDC|USDT|USDS|USDE|PYUSD|USDG|USD1|FDUSD|DAI|USDH|UXD|SYRUPUSDC|WSOL|SOL)$/i;
const HOUR = 3600;

export const events = new EventEmitter();
events.setMaxListeners(0);

const trades: WhaleTrade[] = []; // newest first
const seen = new Set<string>();
let streamStatus: "connecting" | "open" | "closed" = "connecting";

function key(t: WhaleTrade) {
  return `${t.signature}:${t.trader}:${t.mint}`;
}

export function addTrade(t: WhaleTrade): boolean {
  const k = key(t);
  if (seen.has(k)) return false;
  seen.add(k);
  // Keep sorted newest first; backfill can arrive out of order.
  const i = trades.findIndex((x) => x.blockTime < t.blockTime);
  if (i === -1) trades.push(t);
  else trades.splice(i, 0, t);
  while (trades.length > MAX_TRADES) seen.delete(key(trades.pop()!));
  events.emit("trade", t);
  return true;
}

export function updateTradeMeta(mint: string, meta: { symbol: string | null; name: string | null; image: string | null }) {
  for (const t of trades) {
    if (t.mint === mint && !t.symbol) Object.assign(t, meta);
  }
  events.emit("token", { mint, ...meta });
}

export function publishProfile(p: WalletProfile) {
  events.emit("profile", p);
}

export function setStatus(s: typeof streamStatus) {
  streamStatus = s;
  events.emit("status", s);
}

export function stats(now = Date.now() / 1000) {
  const lastHour = trades.filter((t) => now - t.blockTime <= HOUR);
  const byWallet = new Map<string, { trader: string; volumeUsd: number; trades: number }>();
  const byToken = new Map<string, { mint: string; symbol: string | null; image: string | null; buyUsd: number; sellUsd: number; whales: Set<string> }>();

  for (const t of lastHour) {
    const w = byWallet.get(t.trader) ?? { trader: t.trader, volumeUsd: 0, trades: 0 };
    w.volumeUsd += t.volumeUsd;
    w.trades++;
    byWallet.set(t.trader, w);

    if (FLOW_EXCLUDED.has(t.mint) || (t.symbol && STABLE_SYMBOLS.test(t.symbol))) continue;
    const k = byToken.get(t.mint) ?? { mint: t.mint, symbol: t.symbol, image: t.image, buyUsd: 0, sellUsd: 0, whales: new Set() };
    k.symbol ??= t.symbol;
    k.image ??= t.image;
    if (t.side === "buy") k.buyUsd += t.volumeUsd;
    else k.sellUsd += t.volumeUsd;
    k.whales.add(t.trader);
    byToken.set(t.mint, k);
  }

  return {
    status: streamStatus,
    hour: {
      trades: lastHour.length,
      volumeUsd: lastHour.reduce((s, t) => s + t.volumeUsd, 0),
      buyUsd: lastHour.filter((t) => t.side === "buy").reduce((s, t) => s + t.volumeUsd, 0),
      wallets: byWallet.size,
    },
    topWallets: [...byWallet.values()].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 10),
    // Net whale flow per token: where the big money is going in or out.
    tokenFlow: [...byToken.values()]
      .map((k) => ({ mint: k.mint, symbol: k.symbol, image: k.image, buyUsd: k.buyUsd, sellUsd: k.sellUsd, netUsd: k.buyUsd - k.sellUsd, whales: k.whales.size }))
      .sort((a, b) => Math.abs(b.netUsd) - Math.abs(a.netUsd))
      .slice(0, 10),
  };
}

export function recentTrades(limit = 200) {
  return trades.slice(0, limit);
}
