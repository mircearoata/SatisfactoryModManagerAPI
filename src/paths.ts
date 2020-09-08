import path from 'path';
import fs from 'fs';
import { getDataHome, getCacheFolder } from 'platform-folders';

export function ensureExists(folder: string): void {
  fs.mkdirSync(folder, { recursive: true });
}

const oldAppName = 'SatisfactoryModLauncher';
export const appName = 'SatisfactoryModManager';

export const oldAppDataDir = path.join(getDataHome(), oldAppName);

export const appDataDir = path.join(getDataHome(), appName);
ensureExists(appDataDir);
export const cacheDir = path.join(getCacheFolder(), appName);
ensureExists(cacheDir);
export const downloadCacheDir = path.join(cacheDir, 'downloadCache');
ensureExists(downloadCacheDir);
export const modCacheDir = path.join(downloadCacheDir, 'mods');
ensureExists(modCacheDir);
export const smlCacheDir = path.join(downloadCacheDir, 'smlVersions');
ensureExists(smlCacheDir);
export const bootstrapperCacheDir = path.join(downloadCacheDir, 'bootstrapperVersions');
ensureExists(bootstrapperCacheDir);

export const logsDir = path.join(cacheDir, 'logs');
ensureExists(logsDir);

export const profileFolder = path.join(appDataDir, 'profiles');
if (fs.existsSync(path.join(appDataDir, 'configs')) && !fs.existsSync(profileFolder)) {
  fs.renameSync(path.join(appDataDir, 'configs'), profileFolder);
}
ensureExists(profileFolder);
