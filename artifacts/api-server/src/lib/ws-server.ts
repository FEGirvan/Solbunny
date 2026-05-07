import WebSocket, { WebSocketServer } from "ws";
import fetch from "node-fetch";
import { logger } from "./logger";

const HELIUS_KEY = process.env["HELIUS_KEY"] ?? "";
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const WS_URL  = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const subscriptions = new Map<string, Set<WebSocket>>();
const subscribedWallets = new Set<string>();
let heliusWs: WebSocket | null = null;

export const wss = new WebSocketServer({ noServer: true });

function broadcast(wallet: string, payload: object): void {
  const clients = subscriptions.get(wallet);
  if (!clients) return;
  const msg = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function connectHelius(): void {
  if (heliusWs) { heliusWs.removeAllListeners(); heliusWs.terminate(); }
  const wallets = Array.from(subscribedWallets);
  if (wallets.length === 0) return;

  heliusWs = new WebSocket(WS_URL);

  heliusWs.on("open", () => {
    logger.info({ wallets }, "Helius realtime WS connected");
    heliusWs!.send(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "logsSubscribe",
      params: [{ mentions: wallets }, { commitment: "processed" }],
    }));
  });

  heliusWs.on("message", async (msg: Buffer) => {
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
        tokenTransfers?: Array<{ mint: string; tokenAmount: number }>;
      }>("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);

      if (!tx) return;
      const wallet = tx.transaction.message.accountKeys[0]?.pubkey;
      const diff = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
      const amt = Math.abs(diff);
      if (amt < 0.05) return;

      const hasToken = (tx.tokenTransfers?.length ?? 0) > 0;
      const isBuy = hasToken && diff < 0;

      broadcast(wallet, {
        type: isBuy ? "ALERT_BUY" : "ALERT",
        data: {
          type: isBuy ? "BUY" : "SELL",
          wallet,
          buyToken: tx.tokenTransfers?.[0]?.mint ?? null,
          buyAmount: tx.tokenTransfers?.[0]?.tokenAmount ?? null,
          token: tx.tokenTransfers?.[0]?.mint ?? "SOL",
          amount: amt.toFixed(4),
          price: null,
          timestamp: tx.blockTime ?? Math.floor(Date.now() / 1000),
        },
      });
    } catch (err) { logger.warn({ err }, "Helius WS parse error"); }
  });

  heliusWs.on("close", () => {
    logger.warn("Helius realtime WS closed — reconnecting in 3s");
    setTimeout(connectHelius, 3000);
  });
  heliusWs.on("error", (err) => { logger.error({ err }, "Helius WS error"); });
}

wss.on("connection", (client) => {
  logger.info("Browser client connected");

  client.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString()) as { type: string; wallet?: string };
      if (data.type === "SUBSCRIBE" && data.wallet) {
        const { wallet } = data;
        if (!subscriptions.has(wallet)) subscriptions.set(wallet, new Set());
        subscriptions.get(wallet)!.add(client);
        const isNew = !subscribedWallets.has(wallet);
        subscribedWallets.add(wallet);
        if (isNew) connectHelius();
        client.send(JSON.stringify({ type: "SUBSCRIBED", wallet }));
        logger.info({ wallet }, "Client subscribed");
      }
    } catch (err) { logger.warn({ err }, "WS client message error"); }
  });

  client.on("close", () => {
    subscriptions.forEach((clients) => clients.delete(client));
    logger.info("Browser client disconnected");
  });
});
