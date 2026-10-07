// A single big (or watched) trade, normalized from Solami's REST and stream shapes.
export type WhaleTrade = {
  signature: string;
  slot: number;
  blockTime: number;
  dex: string;
  pool: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  image: string | null;
  side: "buy" | "sell";
  trader: string;
  volumeUsd: number;
  priceUsd: number;
  priceImpactPct: number;
  traderTags: string[];
  watched: boolean;
};

export type WalletKind = "exchange" | "protocol" | "bot" | "pro-trader" | "whale" | "fresh" | "trader" | "unknown";

export type WalletProfile = {
  address: string;
  kind: WalletKind;
  entity: string | null; // e.g. "Binance", when we know who it is
  tags: string[];
  portfolioUsd: number | null;
  solBalance: number | null;
  topHoldings: { symbol: string; valueUsd: number }[];
  pnlUsd: number | null;
  roiPct: number | null;
  wins: number | null;
  losses: number | null;
  tokensTraded: number | null;
  firstFunder: string | null;
  firstFunderEntity: string | null;
  fundedAt: number | null;
  updatedAt: number;
};
