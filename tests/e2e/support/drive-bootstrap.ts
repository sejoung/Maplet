import { google } from '../../../src/app/driveConnection';

// Only the E2E build loads this dependency. Reloads use normal disconnected startup.
if ((window as Window & { mapletDriveFixture?: boolean }).mapletDriveFixture) {
  if (!google) throw new Error('Drive fixture requires the test Google configuration');
  await google.prepare();
  await google.connect();
}
