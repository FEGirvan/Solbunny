import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { useWs } from "./use-ws";

export interface Alert {
  id: string;
  message: string;
  level: "danger" | "pump" | "whale" | "scanning" | string;
  score?: number;
  timestamp: number;
  source?: "polling" | "realtime";
}

export type WsStatus = "connecting" | "connected" | "disconnected";

interface UseFeedOptions { onDanger?: (alert: Alert) => void; }

export function useFeed(wallets: string[], { onDanger }: UseFeedOptions = {}) {
  const [history, setHistory] = useState<Alert[]>([]);
  const [totalSignals, setTotalSignals] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");

  const addAlerts = useCallback((incoming: Alert[]) => {
    if (incoming.length === 0) return;
    setHistory((prev) => [...incoming, ...prev].slice(0, 1000));
    const active = incoming.filter((a) => a.level !== "scanning");
    if (active.length > 0) setTotalSignals((n) => n + active.length);
    setLastUpdated(new Date());
    incoming.forEach((a) => { if (a.level === "danger") onDanger?.(a); });
  }, [onDanger]);

  useWs({
    wallets,
    onAlert: useCallback((alert: Alert) => addAlerts([alert]), [addAlerts]),
    onStatusChange: setWsStatus,
  });

  const query = useQuery({
    queryKey: ["feed", wallets],
    queryFn: async () => {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallets }),
      });
      if (!response.ok) throw new Error("Failed to fetch feed");
      const data = (await response.json()) as Array<{ message: string; level: string; score?: number }>;
      const newAlerts: Alert[] = data.map((item) => ({
        id: crypto.randomUUID(), message: item.message, level: item.level,
        score: item.score, timestamp: Date.now(), source: "polling" as const,
      }));
      addAlerts(newAlerts);
      return newAlerts;
    },
    enabled: wallets.length > 0,
    refetchInterval: 30000,
  });

  const clearHistory = useCallback(() => { setHistory([]); setTotalSignals(0); }, []);

  return { ...query, history, totalSignals, lastUpdated, wsStatus, clearHistory };
}
