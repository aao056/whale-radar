// Fake data for working on the UI without an API key (MOCK=1). Never used in the real demo.
import { classify } from "./profiler.ts";
import type { RawSwap } from "./solami.ts";
import type { WalletProfile } from "./types.ts";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = () => Array.from({ length: 44 }, () => B58[Math.floor(Math.random() * 58)]).join("");
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const tokens = [
  { mint: addr(), symbol: "BONK", name: "Bonk" },
  { mint: addr(), symbol: "WIF", name: "dogwifhat" },
  { mint: addr(), symbol: "JUP", name: "Jupiter" },
  { mint: addr(), symbol: "POPCAT", name: "Popcat" },
  { mint: addr(), symbol: "PENGU", name: "Pudgy Penguins" },
  { mint: addr(), symbol: "FARTCOIN", name: "Fartcoin" },
];
const wallets = Array.from({ length: 25 }, addr);
const tagsFor = new Map(wallets.map((w) => [w, pick([[], [], ["pro_trader"], ["bot"], ["fresh"], ["diamond_hands"]])]));

export function fakeSwap(): RawSwap {
  const t = pick(tokens);
  const trader = pick(wallets);
  const volume = 10_000 * Math.exp(Math.random() * 3.5);
  return {
    signature: addr() + addr().slice(0, 44),
    slot: 400_000_000 + Math.floor(Math.random() * 1e6),
    block_time: Math.floor(Date.now() / 1000),
    dex: pick(["pumpswap", "raydium", "orca", "meteora"]),
    pool: addr(),
    mint: t.mint,
    side: Math.random() < 0.55 ? "buy" : "sell",
    trader,
    price_usd: (Math.random() * 2).toFixed(6),
    volume_usd: volume.toFixed(2),
    price_impact_pct: (Math.random() * 4).toFixed(2),
    trader_tags: tagsFor.get(trader),
  };
}

export async function fakeMetadata(mints: string[]) {
  return tokens.filter((t) => mints.includes(t.mint)).map((t) => ({ address: t.mint, name: t.name, symbol: t.symbol, image: null }));
}

export async function fakeProfile(address: string, extraTags: string[] = []): Promise<WalletProfile> {
  await new Promise((r) => setTimeout(r, 300));
  const wins = Math.floor(Math.random() * 80);
  const base = {
    address,
    entity: null,
    tags: extraTags,
    portfolioUsd: 50_000 * Math.exp(Math.random() * 4),
    solBalance: Math.random() * 5000,
    topHoldings: tokens.slice(0, 3).map((t) => ({ symbol: t.symbol, valueUsd: Math.random() * 200_000 })),
    pnlUsd: (Math.random() - 0.3) * 400_000,
    roiPct: (Math.random() - 0.3) * 300,
    wins,
    losses: Math.floor(Math.random() * 60),
    tokensTraded: wins + 10,
    firstFunder: addr(),
    firstFunderEntity: pick([null, "Binance", "Coinbase", null]),
    fundedAt: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 400 * 86400),
    updatedAt: Date.now(),
  };
  return { ...base, kind: classify(base) };
}
