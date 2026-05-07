import { useState, useEffect } from "react";

const STORAGE_KEY = "ghost-whale-watchlist";

export function useWatchlist() {
  const [wallets, setWallets] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets)); } catch {}
  }, [wallets]);

  const addWallet = (wallet: string): boolean => {
    const trimmed = wallet.trim();
    if (!trimmed || wallets.includes(trimmed)) return false;
    setWallets((prev) => [...prev, trimmed]);
    return true;
  };

  const removeWallet = (wallet: string) =>
    setWallets((prev) => prev.filter((w) => w !== wallet));

  return { wallets, addWallet, removeWallet };
}
