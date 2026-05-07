import { useState, useCallback, useEffect } from "react";

export type NotifPermission = "default" | "granted" | "denied" | "unsupported";

export function useNotifications() {
  const [permission, setPermission] = useState<NotifPermission>(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission as NotifPermission;
  });

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission as NotifPermission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result as NotifPermission);
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      const n = new Notification(title, { body, icon: "/favicon.ico", tag: "ghost-whale-alert" });
      setTimeout(() => n.close(), 6000);
    } catch {}
  }, [permission]);

  return { permission, requestPermission, notify };
}
