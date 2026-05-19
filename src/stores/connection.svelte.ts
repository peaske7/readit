export const ConnectionStates = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
} as const;

export type ConnectionState =
  (typeof ConnectionStates)[keyof typeof ConnectionStates];

export const connection = $state({
  state: ConnectionStates.CONNECTED as ConnectionState,
});

let source: EventSource | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectDelayMs = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function connect(): void {
  source = new EventSource("/api/heartbeat");

  source.onopen = () => {
    connection.state = ConnectionStates.CONNECTED;
    reconnectDelayMs = 1000;
  };

  source.onerror = () => {
    source?.close();
    source = undefined;
    connection.state = ConnectionStates.DISCONNECTED;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
      connect();
    }, reconnectDelayMs);
  };
}

export function startHeartbeat(): void {
  if (source) return;
  connect();
}

export function stopHeartbeat(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  source?.close();
  source = undefined;
}
