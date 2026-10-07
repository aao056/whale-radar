# 🐋 Whale Radar

**Every big trade on Solana, live, and who's behind it.**

Whale Radar watches the whole Solana DEX market for large trades, then answers the question every trader asks next: *who was that?* For each whale it builds a profile (portfolio, PnL, win rate, who funded the wallet) and labels it: exchange, bot, pro trader, fresh wallet, or whale. You get a live dashboard and, optionally, Telegram alerts.

Built for the Colosseum **Crypto World's Fair** hackathon ([project page](https://colosseum.com/arena/projects/whale-radar)), on [Solami](https://solami.dev).

## What it does

- **Live whale feed.** Every swap above your USD threshold, on any DEX, the moment it confirms.
- **Wallet profiles.** Click any trader to see portfolio value, top holdings, total PnL, win rate, and who first funded the wallet (with known exchanges named).
- **Wallet labels.** `exchange` · `protocol` · `bot` · `pro-trader` · `whale` · `fresh` · `trader`, from Solami's wallet tags, funding history, and PnL.
- **Whale money flow.** Net whale buying vs selling per token over the last hour: where the big money is going (SOL and stablecoins left out, since they're on one side of nearly every trade).
- **Watchlist.** Follow specific wallets at any trade size.
- **Telegram alerts** for the biggest trades (optional).

## How it uses Solami

| Solami product | Used for |
|---|---|
| Blur WebSocket (`/data/subscribe`, `type=swap`, `min_volume_usd`) | The live whale feed, filtered server-side |
| Blur WebSocket (`trader=` filter) | Watchlist wallets at any size |
| `GET /data/trades/large` | Backfilling the last hour on startup |
| `GET /data/wallet/balance` | Portfolio value and top holdings |
| `GET /data/wallet/pnl` | PnL, win rate, wallet tags |
| `GET /data/wallet/funding` | Who funded the wallet, for exchange-funded and fresh-wallet detection |
| `POST /data/token/metadata` | Token names and logos for streamed swaps |

## Run it

Requires **Node.js 23.6+** (runs TypeScript directly, no build step, zero runtime dependencies).

```bash
git clone https://github.com/aao056/whale-radar && cd whale-radar
cp .env.example .env      # then put your Solami key in SOLAMI_API_KEY
npm start                 # open http://localhost:3000
```

Get a key at [solami.dev](https://solami.dev) and give it the **DataApi** permission.

No key yet? `npm run mock` runs the dashboard with fake data so you can see the UI.

### Configuration (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `SOLAMI_API_KEY` | – | Your Solami key (DataApi permission) |
| `MIN_VOLUME_USD` | `10000` | Smallest trade that counts as a whale trade |
| `WATCHLIST` | – | Comma-separated wallets to follow at any size |
| `PORT` | `3000` | Dashboard port |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | – | Enable Telegram alerts (make a bot with @BotFather) |
| `TELEGRAM_MIN_USD` | `MIN_VOLUME_USD` | Only alert on trades at least this big |

### Custom labels

Add known wallets in `labels.json` at the repo root:

```json
{ "WalletAddressHere": { "entity": "My Fund", "kind": "whale" } }
```

## Code map

```
src/index.ts      wiring: backfill, live streams, server
src/solami.ts     Solami REST + WebSocket client (retries, reconnect, backoff)
src/radar.ts      pipeline: swap -> trade -> token metadata -> wallet profile -> feed/alerts
src/profiler.ts   wallet profile + classification, cached
src/labels.ts     known exchanges/protocols (+ your labels.json)
src/store.ts      recent trades and rolling 1h stats
src/server.ts     dashboard, JSON API, Server-Sent Events
src/telegram.ts   rate-limited Telegram alerts
public/index.html the dashboard (vanilla JS)
```

## Caveats

Wallet labels are heuristics, not facts. The built-in exchange list is a small starter set; verify addresses before relying on them. Several Solami data routes are in beta, and the app degrades gracefully if one fails.

## License

MIT
