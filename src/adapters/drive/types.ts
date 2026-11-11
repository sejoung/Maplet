/** A Drive file or folder as the user picked it: its ID and display name. */
export interface DriveItem {
  id: string;
  name: string;
}
export type DriveFolder = DriveItem;

export interface DriveFile extends DriveItem {
  /** Missing in metadata saved by older releases; fetched again before opening. */
  mimeType?: string;
  version: string;
  etag: string | null;
  parents?: string[];
}
export type OpenedDriveFile = DriveFile & { content: string };

export interface SaveOptions {
  /** Write even if the file changed since `file.version`. */
  overwrite?: boolean;
  /** Rename the file in the same request; defaults to its current name. */
  name?: string;
}

/** File operations the app needs from Drive; `DriveClient` implements them over REST. */
export interface DriveFiles {
  open(id: string): Promise<OpenedDriveFile>;
  /** The folder, if it still exists and accepts new files. */
  folder(id: string): Promise<DriveFolder>;
  save(file: DriveFile, content: string, options?: SaveOptions): Promise<DriveFile>;
  /** `operation` identifies one logical creation, so a retry never makes a second file. */
  create(name: string, content: string, parentId?: string, operation?: string): Promise<DriveFile>;
}

export type AuthEvent = 'connected' | 'expiring' | 'expired' | 'disconnected';
export type PickKind = 'file' | 'folder';
export interface PickOptions {
  /** Picker interface language, such as `en`. */
  language: string;
  /** Already translated: adapters hold no interface text. */
  title: string;
}

/** Google sign-in and the Drive Picker; `GoogleConnection` implements them. */
export interface DriveAuth {
  getToken(): string | null;
  /** Whether the token is inside its renewal window. */
  expiring(): boolean;
  subscribe(listener: (event: AuthEvent) => void): () => void;
  /** Load Google's scripts; the Picker needs them before the first pick. */
  prepare(): Promise<void>;
  /** Ask for a token; Google's popup needs a user gesture. */
  connect(): Promise<void>;
  /** Forget a token Drive rejected, without revoking consent. */
  clearToken(): void;
  pick(kind: PickKind, options: PickOptions): Promise<DriveItem | null>;
  disconnect(): Promise<void>;
}
