import { Router } from "express";
import fetch from "node-fetch";

const router = Router();
const HELIUS_KEY = process.env["HELIUS_KEY"] ?? "";

interface HeliusTx {
  type: string;
  signature: string;
  timestamp: number;
  tokenTransfers?: Array<{ mint: string; tokenAmount: number }>;
  nativeTransfers?: Array<{ amount: number }>;
}

router.get("/track/:wallet", async (req, res) => {
  try {
    const { wallet } = req.params;
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_KEY}&limit=20`;
    const data = (await fetch(url).then((r) => r.json())) as HeliusTx[];

    const txs = data.map((tx) => {
      const hasToken = (tx.tokenTransfers?.length ?? 0) > 0;
      const isBuy = tx.type === "SWAP" && hasToken;
      return {
        type: isBuy ? "BUY" : "SELL",
        buyToken: tx.tokenTransfers?.[0]?.mint ?? null,
        buyAmount: tx.tokenTransfers?.[0]?.tokenAmount ?? null,
        token: tx.tokenTransfers?.[0]?.mint ?? "SOL",
        amount: tx.nativeTransfers?.[0]?.amount != null
          ? (tx.nativeTransfers[0].amount / 1e9).toFixed(4) : "0",
        price: null,
        timestamp: tx.timestamp,
        signature: tx.signature,
      };
    });

    res.json(txs);
  } catch (err) {
    req.log.error({ err }, "track error");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
