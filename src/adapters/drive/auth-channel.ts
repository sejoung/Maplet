import { isNonEmptyString } from '../../domain/guards';
import { isJsonObject } from '../../domain/json';

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

/** Messages come from other pages of the origin, so only well-formed ones are accepted. */
export function parseAuthMessage(value: unknown): AuthMessage | null {
  if (!isJsonObject(value)) return null;
  const token = isNonEmptyString(value.token) ? value.token : null;
  if (value.type === 'request') return { type: 'request' };
  if (value.type === 'disconnected') return { type: 'disconnected' };
  if (value.type === 'expired' && token) return { type: 'expired', token };
  if (
    value.type === 'token' &&
    token &&
    typeof value.expiresIn === 'number' &&
    Number.isFinite(value.expiresIn) &&
    value.expiresIn > 0
  )
    return { type: 'token', token, expiresIn: value.expiresIn };
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
