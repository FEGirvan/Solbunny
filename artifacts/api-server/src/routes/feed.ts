import { Router, type IRouter } from "express";
import fetch from "node-fetch";
import WebSocket from "ws";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const HELIUS_KEY = process.env["HELIUS_KEY"] ?? "";
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const WS_URL  = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

interface TxSignal { wallet: string; amt: number; time: number; }
interface Signal { message: string; level: "danger" | "pump" | "whale" | "scanning"; score: number; }

async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function calculateScore(txs: TxSignal[]): number {
  let score = 0;
  txs.forEach((t) => {
    if (t.amt > 5) score += 30;
    else if (t.amt > 1) score += 15;
    else if (t.amt > 0.1) score += 5;
    else if (t.amt > 0.05) score += 2;
  });
  if (txs.length >= 6) score += 20;
  else if (txs.length >= 3) score += 10;
  const wallets = new Set(txs.map((t) => t.wallet));
  if (wallets.size >= 4) score += 20;
  else if (wallets.size >= 2) score += 10;
  return Math.min(score, 100);
}

function buildSignal(score: number): Signal {
  if (score >= 70) return { message: "ALPHA GHOST DETECTED", level: "danger", score };
  if (score >= 40) return { message: "MOMENTUM BUILDING",   level: "pump",   score };
  if (score > 0)   return { message: "SHADOW MOVES",        level: "whale",  score };
  return { message: "SCANNING SECTOR...", level: "scanning", score: 0 };
}

let liveTx: TxSignal[] = [];
let activeWs: WebSocket | null = null;
let activeWallets: string[] = [];

function startWebSocket(wallets: string[]): void {
  if (activeWs) { activeWs.removeAllListeners(); activeWs.terminate(); activeWs = null; }
  if (wallets.length === 0) return;
  activeWallets = wallets;
  const ws = new WebSocket(WS_URL);
  activeWs = ws;

  ws.on("open", () => {
    logger.info("WS connected to Helius");
    ws.send(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "logsSubscribe",
      params: [{ mentions: wallets }, { commitment: "processed" }],
    }));
  });

  ws.on("message", async (msg: Buffer) => {
    try {
      const data = JSON.parse(msg.toString()) as {
        params?: { result: { value: { signature: string } } };
      };
      if (!data.params) return;
      const sig = data.params.result.value.signature;
      const tx = await rpc<{
        meta: { preBalances: number[]; postBalances: number[] };
        blockTime: number;
        transaction: { message: { accountKeys: Array<{ pubkey: string }> } };
      }>("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
      if (!tx) return;
      const diff = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
      const amt = Math.abs(diff);
      if (amt < 0.05) return;
      const signal: TxSignal = {
        wallet: tx.transaction.message.accountKeys[0].pubkey,
        amt,
        time: tx.blockTime || Date.now() / 1000,
      };
      const now = Date.now() / 1000;
      liveTx.push(signal);
      liveTx = liveTx.filter((t) => now - t.time < 60);
    } catch (err) { logger.warn({ err }, "WS message error"); }
  });

  ws.on("close", () => {
    logger.warn("WS closed — reconnecting in 3s");
    setTimeout(() => startWebSocket(activeWallets), 3000);
  });
  ws.on("error", (err) => { logger.error({ err }, "WS error"); });
}

router.post("/feed", async (req, res) => {
  try {
    const wallets: string[] = (req.body.wallets ?? []).slice(0, 5);
    if (wallets.length === 0) { res.json([buildSignal(0)]); return; }

    startWebSocket(wallets);
    const txs: TxSignal[] = [];

    for (const w of wallets) {
      const sigs = await rpc<Array<{ signature: string }>>("getSignaturesForAddress", [w, { limit: 10 }]);
      if (!sigs) continue;
      const details = await Promise.all(
        sigs.map((s) =>
          rpc<{ meta: { preBalances: number[]; postBalances: number[] }; blockTime: number }>(
            "getTransaction",
            [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
          ).catch(() => null),
        ),
      );
      details.forEach((tx) => {
        if (!tx) return;
        const diff = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
        const amt = Math.abs(diff);
        if (amt < 0.05) return;
        txs.push({ wallet: w, amt, time: tx.blockTime || 0 });
      });
    }

    const combined = [...txs, ...liveTx];
    res.json([buildSignal(calculateScore(combined))]);
  } catch (err) {
    req.log.error({ err }, "feed error");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
