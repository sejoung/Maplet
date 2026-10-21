/** Messages exchanged between open tabs of the same origin; nothing is persisted. */
export type AuthMessage =
  | { type: 'request' }
  | { type: 'token'; token: string; expiresIn: number }
  | { type: 'expired'; token: string }
  | { type: 'disconnected' };

export interface AuthChannel {
  post(message: AuthMessage): void;
  listen(receive: (message: AuthMessage) => void): void;
}

export function parseAuthMessage(value: unknown): AuthMessage | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const token = typeof item.token === 'string' && item.token.length > 0 ? item.token : null;
  if (item.type === 'request') return { type: 'request' };
  if (item.type === 'disconnected') return { type: 'disconnected' };
  if (item.type === 'expired' && token) return { type: 'expired', token };
  if (
    item.type === 'token' &&
    token &&
    typeof item.expiresIn === 'number' &&
    Number.isFinite(item.expiresIn) &&
    item.expiresIn > 0
  )
    return { type: 'token', token, expiresIn: item.expiresIn };
  return null;
}

export function openAuthChannel(clientId: string): AuthChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const channel = new BroadcastChannel(`maplet:auth:${clientId}`);
    return {
      post: (message) => {
        try {
          channel.postMessage(message);
        } catch {
          // Other tabs fall back to their own reconnection.
        }
      },
      listen: (receive) => {
        channel.onmessage = (event: MessageEvent) => {
          const message = parseAuthMessage(event.data);
          if (message) receive(message);
        };
      },
    };
  } catch {
    return null;
  }
}
