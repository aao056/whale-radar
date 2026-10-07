// Optional Telegram alerts for the biggest trades, sent to your own bot/channel.
import { config } from "./config.ts";
import type { WalletProfile, WhaleTrade } from "./types.ts";

export const telegramEnabled = Boolean(config.telegram.token && config.telegram.chatId);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

// Telegram allows ~20 messages/minute to a group; keep well under it.
const queue: string[] = [];
let sending = false;

async function drain() {
  if (sending) return;
  sending = true;
  while (queue.length) {
    const text = queue.shift()!;
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      if (!res.ok) console.warn(`[telegram] ${res.status} ${await res.text()}`);
    } catch (e) {
      console.warn(`[telegram] ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 3500));
  }
  sending = false;
}

export function alert(t: WhaleTrade, p: WalletProfile | undefined) {
  if (!telegramEnabled) return;
  if (t.volumeUsd < config.telegram.minUsd && !t.watched) return;
  if (queue.length > 20) return; // a burst; drop rather than fall minutes behind

  const token = t.symbol ? `$${esc(t.symbol)}` : short(t.mint);
  const who = p?.entity ?? (p ? p.kind.replace("-", " ") : "wallet");
  const lines = [
    `${t.side === "buy" ? "🟢" : "🔴"} <b>${usd(t.volumeUsd)} ${t.side.toUpperCase()}</b> ${token} on ${esc(t.dex)}`,
    `${t.watched ? "👁 watched " : ""}${esc(who)} <code>${short(t.trader)}</code>`,
  ];
  if (p?.portfolioUsd) lines.push(`Portfolio ${usd(p.portfolioUsd)}${p.pnlUsd != null ? ` · PnL ${usd(p.pnlUsd)}` : ""}`);
  if (p?.firstFunderEntity) lines.push(`Funded from ${esc(p.firstFunderEntity)}`);
  lines.push(`<a href="https://solscan.io/tx/${t.signature}">tx</a> · <a href="https://solscan.io/account/${t.trader}">wallet</a>`);

  queue.push(lines.join("\n"));
  void drain();
}
