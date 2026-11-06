import { AppError } from '../../domain/errors';
import { clearDriveSession } from './session';
import type { AuthChannel, AuthMessage } from './auth-channel';
import { loadScript, reloadScript } from './script-loader';
import { showPicker } from './picker';
import type { AuthEvent, DriveAuth, DriveItem, PickKind, PickOptions } from './types';

export interface GoogleConfig {
  clientId: string;
  apiKey: string;
  appId: string;
}
/** Google's popup needs a user gesture, so renewal is offered this long before expiry. */
export const RENEW_BEFORE = 10 * 60_000;
const IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';
const PICKER_TIMEOUT_MS = 15_000;
const REVOKE_TIMEOUT_MS = 10_000;
/** Google reports the lifetime in seconds; stop using a token a little before it lapses. */
const EXPIRY_MARGIN_S = 30;

/**
 * A memory-only Google token with its expiry schedule, shared between open tabs through
 * `channel`. Members passed as callbacks (`getToken` to the Drive client, `receive` to the
 * channel) are arrow properties so they keep `this`.
 */
export class GoogleConnection implements DriveAuth {
  private token: string | null = null;
  private expiresAt = 0;
  private timers: number[] = [];
  private generation = 0;
  private readonly listeners = new Set<(event: AuthEvent) => void>();
  constructor(
    readonly config: GoogleConfig,
    private readonly channel: AuthChannel | null = null,
  ) {
    // Every connection starts memory-only, even if an older release stored credentials.
    clearDriveSession();
    // Open tabs hand over their in-memory token; it never reaches browser storage.
    channel?.listen(this.receive);
    channel?.post({ type: 'request' });
  }
  getToken = (): string | null => {
    if (Date.now() < this.expiresAt) return this.token;
    this.token = null;
    this.expiresAt = 0;
    return null;
  };
  expiring(): boolean {
    return Boolean(this.getToken()) && this.expiresAt - Date.now() <= RENEW_BEFORE;
  }
  subscribe(listener: (event: AuthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  clearToken(): void {
    const token = this.token;
    this.forget();
    if (token) this.channel?.post({ type: 'expired', token });
  }
  private forget(): void {
    this.generation++;
    this.keep(null, 0);
    clearDriveSession();
  }
  /** Announce the renewal window and the expiry itself instead of waiting for a failed request. */
  private keep(token: string | null, expiresAt: number): void {
    this.token = token;
    this.expiresAt = expiresAt;
    this.timers.forEach((timer) => clearTimeout(timer));
    const left = expiresAt - Date.now();
    this.timers = token
      ? [
          window.setTimeout(() => this.emit('expiring'), Math.max(0, left - RENEW_BEFORE)),
          window.setTimeout(() => {
            // A renewal popup may still be open, so pending OAuth responses stay valid.
            this.keep(null, 0);
            this.emit('expired');
          }, left),
        ]
      : [];
  }
  private share(): void {
    const token = this.getToken();
    if (token) this.channel?.post({ type: 'token', token, expiresIn: this.expiresAt - Date.now() });
  }
  private receive = (message: AuthMessage): void => {
    if (message.type === 'request') this.share();
    else if (message.type === 'token') {
      // Remaining lifetime, not a timestamp, so tabs never extend Google's expiry.
      const expiresAt = Date.now() + message.expiresIn;
      if (this.getToken() && expiresAt <= this.expiresAt) return;
      this.keep(message.token, expiresAt);
      this.emit('connected');
    } else if (message.type === 'expired') {
      if (message.token !== this.token) return;
      this.forget();
      this.emit('expired');
    } else {
      this.forget();
      this.emit('disconnected');
    }
  };
  private emit(event: AuthEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  async prepare(): Promise<void> {
    await Promise.all([loadScript(IDENTITY_SCRIPT), loadScript(PICKER_SCRIPT)]);
    await new Promise<void>((resolve, reject) =>
      window.gapi!.load('picker', {
        callback: resolve,
        onerror: () => reject(new AppError('drive.couldNotLoadFilePicker')),
        timeout: PICKER_TIMEOUT_MS,
        ontimeout: () => reject(new AppError('drive.filePickerConnectionTimedOut')),
      }),
    );
  }

  async connect(): Promise<void> {
    if (!window.google?.accounts) throw new AppError('drive.waitGoogleServicesLoadThen');
    const generation = ++this.generation;
    await new Promise<void>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (result) => {
          if (generation !== this.generation) {
            reject(new AppError('drive.googleDriveConnectionRequestCancelled'));
            return;
          }
          if (result.error || !result.access_token) {
            reject(new AppError('drive.googleDriveAuthorizationCancelled'));
            return;
          }
          this.keep(
            result.access_token,
            Date.now() + Math.max(0, (result.expires_in ?? 3600) - EXPIRY_MARGIN_S) * 1000,
          );
          this.share();
          resolve();
        },
        error_callback: () => reject(new AppError('drive.googleSignWindowClosedBlocked')),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  async pick(kind: PickKind, options: PickOptions): Promise<DriveItem | null> {
    const token = this.getToken();
    if (!token) throw new AppError('drive.connectGoogleDriveFirst');
    return showPicker(kind, {
      ...options,
      api: window.google!.picker,
      token,
      apiKey: this.config.apiKey,
      appId: this.config.appId,
    });
  }

  async disconnect(): Promise<void> {
    const token = this.getToken();
    this.forget();
    this.channel?.post({ type: 'disconnected' });
    if (!token) return;
    try {
      await revoke(token);
    } catch {
      throw new AppError('drive.disconnectedDeviceButGooglePermission');
    }
  }
}

/** Withdraw Google's consent for `token`; rejects unless Google confirms it in time. */
async function revoke(token: string): Promise<void> {
  if (!window.google?.accounts?.oauth2) await reloadScript(IDENTITY_SCRIPT);
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('revoke timeout')), REVOKE_TIMEOUT_MS);
    try {
      window.google!.accounts.oauth2.revoke(token, (result) => {
        clearTimeout(timer);
        if (result?.successful) resolve();
        else reject(new Error('revoke failed'));
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
