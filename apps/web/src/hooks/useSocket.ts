import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import { getAccessToken, onTokenChange } from "../api/client";

/**
 * One shared, authenticated socket per tab. When the access token changes
 * (login, refresh, logout) the socket reconnects with the new token and every
 * component using this hook re-renders with the new instance.
 */
let socket: Socket | null = null;
let currentToken: string | null = null;
const subscribers = new Set<() => void>();

function connect(token: string | null) {
  if (token === currentToken && socket) return;
  currentToken = token;
  socket?.disconnect();
  socket = token ? io({ auth: { token }, transports: ["websocket"] }) : null;
  subscribers.forEach((notify) => notify());
}

onTokenChange(connect);

function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (!socket) connect(getAccessToken());
  return () => {
    subscribers.delete(notify);
  };
}

export function useSocket(): Socket | null {
  return useSyncExternalStore(subscribe, () => socket);
}
