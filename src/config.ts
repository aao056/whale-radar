try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const mock = process.env.MOCK === "1";
const apiKey = process.env.SOLAMI_API_KEY ?? "";
if (!mock && !apiKey) {
  console.error("SOLAMI_API_KEY is missing. Copy .env.example to .env and add your key, or run with MOCK=1.");
  process.exit(1);
}

const minVolumeUsd = num("MIN_VOLUME_USD", 10_000);

export const config = {
  mock,
  apiKey,
  minVolumeUsd,
  watchlist: list("WATCHLIST"),
  port: num("PORT", 3000),
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    minUsd: num("TELEGRAM_MIN_USD", minVolumeUsd),
  },
  apiBase: "https://api.solami.dev",
  wsBase: "wss://ws.solami.dev",
};
