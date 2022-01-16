import path from 'path';
import fs from 'fs';
import { getDataHome, getCacheFolder } from 'platform-folders';

export function ensureExists(folder: string): void {
  fs.mkdirSync(folder, { recursive: true });
}

export const appName = 'SatisfactoryModManager';

export const appDataDir = path.join(getDataHome(), appName);
ensureExists(appDataDir);
export const cacheDir = path.join(getCacheFolder(), appName);
ensureExists(cacheDir);
export const downloadCacheDir = path.join(cacheDir, 'downloadCache');
ensureExists(downloadCacheDir);
