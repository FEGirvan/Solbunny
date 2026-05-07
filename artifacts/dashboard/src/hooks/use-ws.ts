import { useEffect, useRef, useCallback } from "react";
import { Alert } from "./use-feed";

type WsStatus = "connecting" | "connected" | "disconnected";

interface WsAlertPayload {
  type: "ALERT_BUY" | "ALERT" | "SUBSCRIBED";
  data?: { type: string; wallet: string; buyToken?: string | null; buyAmount?: number | null; token?: string; amount: string; price: null; timestamp: number; };
  wallet?: string;
}

interface UseWsOptions {
  wallets: string[];
  onAlert: (alert: Alert) => void;
  onStatusChange: (status: WsStatus) => void;
}

export function useWs({ wallets, onAlert, onStatusChange }: UseWsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;

  const connect = useCallback(() => {
    if (!mountedRef.current || walletsRef.current.length === 0) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/ws`);
    wsRef.current = ws;
    onStatusChange("connecting");

    ws.onopen = () => {
      if (!mountedRef.current) return;
      onStatusChange("connected");
      walletsRef.current.forEach((wallet) => ws.send(JSON.stringify({ type: "SUBSCRIBE", wallet })));
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const payload = JSON.parse(event.data as string) as WsAlertPayload;
        if (payload.type === "SUBSCRIBED" || !payload.data) return;
        const d = payload.data;
        const isBuy = payload.type === "ALERT_BUY";
        const token = d.buyToken ?? d.token ?? "SOL";
        const shortToken = token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-4)}` : token;
        onAlert({
          id: crypto.randomUUID(),
          message: isBuy ? `LIVE BUY ${d.amount} SOL → ${shortToken}` : `LIVE MOVE ${d.amount} SOL`,
          level: isBuy ? "pump" : "whale",
          score: 0,
          timestamp: d.timestamp * 1000,
          source: "realtime",
        });
      } catch {}
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      onStatusChange("disconnected");
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  }, [onAlert, onStatusChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (wallets.length === 0) {
      wsRef.current?.close();
      wsRef.current = null;
      onStatusChange("disconnected");
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wallets.forEach((wallet) => wsRef.current!.send(JSON.stringify({ type: "SUBSCRIBE", wallet })));
    } else {
      wsRef.current?.close();
      connect();
    }
  }, [wallets, connect, onStatusChange]);
}
