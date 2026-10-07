import { config } from "./config.ts";
import * as solami from "./solami.ts";
import * as store from "./store.ts";
import * as mock from "./mock.ts";
import { cachedProfile, getProfile, onProfileUpdate, seedProfile } from "./profiler.ts";
import { createRadar } from "./radar.ts";
import { startServer } from "./server.ts";
import { telegramEnabled } from "./telegram.ts";

const profileFn = config.mock
  ? async (a: string, tags: string[] = []) => {
      const p = cachedProfile(a) ?? (await mock.fakeProfile(a, tags));
      seedProfile(p);
      return p;
    }
  : getProfile;

const radar = createRadar({
  getProfile: profileFn,
  fetchMetadata: config.mock ? mock.fakeMetadata : solami.tokenMetadata,
  watchlist: new Set(config.watchlist),
});

onProfileUpdate(store.publishProfile);

startServer(config.port, (a) => profileFn(a, []));

console.log(
  `[radar] whales >= $${config.minVolumeUsd.toLocaleString()} · watchlist ${config.watchlist.length} · telegram ${telegramEnabled ? "on" : "off"}${config.mock ? " · MOCK DATA" : ""}`,
);

if (config.mock) {
  store.setStatus("open");
  for (let i = 0; i < 15; i++) radar.ingest({ ...mock.fakeSwap(), block_time: Math.floor(Date.now() / 1000) - i * 120 }, { alert: false });
  setInterval(() => radar.ingest(mock.fakeSwap(), { alert: true }), 2500);
} else {
  // 1. Backfill the last hour so the dashboard isn't empty on start.
  try {
    const recent = await solami.largeTrades(config.minVolumeUsd, 3600, 200);
    for (const t of recent) radar.ingest(t, { alert: false });
    console.log(`[radar] backfilled ${recent.length} trades from the last hour`);
  } catch (e) {
    console.warn(`[radar] backfill failed: ${(e as Error).message}`);
  }

  // 2. Live: every swap above the threshold, anywhere on Solana.
  solami.stream({
    filter: { type: "swap", min_volume_usd: config.minVolumeUsd },
    onSwap: (s) => radar.ingest(s, { alert: true }),
    onStatus: (s, d) => {
      store.setStatus(s);
      console.log(`[stream] whales ${s}${d ? ` (${d})` : ""}`);
    },
  });

  // 3. Live: every swap by a watched wallet, whatever the size.
  if (config.watchlist.length) {
    solami.stream({
      filter: { type: "swap", trader: config.watchlist.join(",") },
      onSwap: (s) => radar.ingest(s, { alert: true }),
      onStatus: (s, d) => console.log(`[stream] watchlist ${s}${d ? ` (${d})` : ""}`),
    });
  }
}
