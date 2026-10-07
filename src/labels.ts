// Known entities: a small starter list. Each address was checked to exist on mainnet (Oct 2026)
// and the exchange ones hold large balances, but labels are still best-effort. Add your own in labels.json:
//   { "address": { "entity": "Name", "kind": "exchange" } }
import { readFileSync } from "node:fs";
import type { WalletKind } from "./types.ts";

type Label = { entity: string; kind: WalletKind };

const builtin: Record<string, Label> = {
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9": { entity: "Binance", kind: "exchange" },
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": { entity: "Binance", kind: "exchange" },
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS": { entity: "Coinbase", kind: "exchange" },
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": { entity: "Coinbase", kind: "exchange" },
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2": { entity: "Bybit", kind: "exchange" },
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": { entity: "Jupiter", kind: "protocol" },
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { entity: "Raydium AMM", kind: "protocol" },
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": { entity: "Meteora DLMM", kind: "protocol" },
};

function loadCustom(): Record<string, Label> {
  try {
    return JSON.parse(readFileSync(new URL("../labels.json", import.meta.url), "utf8"));
  } catch {
    return {};
  }
}

const labels: Record<string, Label> = { ...builtin, ...loadCustom() };

export function lookup(address: string | null | undefined): Label | null {
  return (address && labels[address]) || null;
}
