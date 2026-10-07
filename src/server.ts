// Dashboard server: static page, a JSON snapshot, and a Server-Sent Events feed. No framework.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import * as store from "./store.ts";
import { cachedProfile } from "./profiler.ts";
import type { WalletProfile } from "./types.ts";

type ProfileLookup = (address: string) => Promise<WalletProfile>;

const INDEX = new URL("../public/index.html", import.meta.url);

// Wallet lookups cost Solami API calls; when the dashboard is public, cap them per visitor.
const LOOKUPS_PER_MINUTE = 20;
const lookups = new Map<string, number[]>();
function allowLookup(ip: string): boolean {
  const now = Date.now();
  const recent = (lookups.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LOOKUPS_PER_MINUTE) return false;
  recent.push(now);
  lookups.set(ip, recent);
  if (lookups.size > 10_000) lookups.clear();
  return true;
}

export function startServer(port: number, lookupProfile: ProfileLookup) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    try {
      if (url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await readFile(INDEX));
        return;
      }

      if (url.pathname === "/api/state") {
        const trades = store.recentTrades();
        const profiles = Object.fromEntries(
          [...new Set(trades.map((t) => t.trader))].flatMap((a) => {
            const p = cachedProfile(a);
            return p ? [[a, p]] : [];
          }),
        );
        json(res, { trades, profiles, stats: store.stats() });
        return;
      }

      const wallet = url.pathname.match(/^\/api\/wallet\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
      if (wallet) {
        const ip = String(req.headers["x-real-ip"] ?? req.socket.remoteAddress ?? "");
        if (!allowLookup(ip)) {
          json(res, { error: "Too many wallet lookups, try again in a minute." }, 429);
          return;
        }
        json(res, await lookupProfile(wallet[1]));
        return;
      }

      if (url.pathname === "/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        const send = (event: string) => (data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        const handlers = { trade: send("trade"), profile: send("profile"), token: send("token"), status: send("status") };
        for (const [e, h] of Object.entries(handlers)) store.events.on(e, h);
        const statsTimer = setInterval(() => send("stats")(store.stats()), 5000);
        const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
        req.on("close", () => {
          for (const [e, h] of Object.entries(handlers)) store.events.off(e, h);
          clearInterval(statsTimer);
          clearInterval(ping);
        });
        return;
      }

      res.writeHead(404).end("not found");
    } catch (e) {
      console.warn(`[http] ${url.pathname}: ${(e as Error).message}`);
      if (!res.headersSent) json(res, { error: (e as Error).message }, 502);
    }
  });

  // HOST=127.0.0.1 when running behind a reverse proxy.
  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => console.log(`[http] dashboard on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`));
  return server;
}

function json(res: import("node:http").ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
