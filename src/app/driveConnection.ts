import { DriveClient } from '../adapters/drive/client';
import { GoogleConnection, type GoogleConfig } from '../adapters/drive/google';
import { openAuthChannel } from '../adapters/drive/auth-channel';

export const config: GoogleConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
  appId: import.meta.env.VITE_GOOGLE_APP_ID ?? '',
};
export const google =
  config.clientId && config.apiKey && config.appId
    ? new GoogleConnection(config, openAuthChannel(config.clientId))
    : null;
export const drive = google ? new DriveClient(google.getToken) : null;
