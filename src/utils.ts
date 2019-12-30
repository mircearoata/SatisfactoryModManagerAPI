import { getDataHome, getCacheFolder } from 'platform-folders';
import path from 'path';
import fs from 'fs';

export const appName = 'SatisfactoryModLauncher';

function ensureExists(folder: string): void {
  fs.mkdirSync(folder, { recursive: true });
}

export const appDataDir = path.join(getDataHome(), appName);
ensureExists(appDataDir);
export const cacheDir = path.join(getCacheFolder(), appName);
ensureExists(cacheDir);
export const modCacheDir = path.join(cacheDir, 'mods');
ensureExists(modCacheDir);
