interface DriveSession {
  token: string;
  expiresAt: number;
}
const key = (clientId: string) => `maplet:drive-session:${clientId}`;

export function clearDriveSession(clientId: string): void {
  try {
    sessionStorage.removeItem(key(clientId));
  } catch {
    // Storage can be unavailable; the in-memory connection still works.
  }
}

export function readDriveSession(clientId: string): DriveSession | null {
  try {
    const session = JSON.parse(
      sessionStorage.getItem(key(clientId)) ?? 'null',
    ) as DriveSession | null;
    if (
      session &&
      typeof session.token === 'string' &&
      session.token.length > 0 &&
      Number.isFinite(session.expiresAt) &&
      session.expiresAt > Date.now()
    )
      return { token: session.token, expiresAt: session.expiresAt };
  } catch {
    // Expired and damaged sessions fall back to an explicit connection.
  }
  clearDriveSession(clientId);
  return null;
}

export function writeDriveSession(clientId: string, session: DriveSession): void {
  if (session.expiresAt <= Date.now()) return clearDriveSession(clientId);
  try {
    sessionStorage.setItem(key(clientId), JSON.stringify(session));
  } catch {
    // Keep the current connection when browser storage is blocked or full.
  }
}
