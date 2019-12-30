import { getDataHome, getCacheFolder } from 'platform-folders';
import path from 'path';
import fs from 'fs';
import request from 'request-promise-native';

export const appName = 'SatisfactoryModLauncher';

export function ensureExists(folder: string): void {
  fs.mkdirSync(folder, { recursive: true });
}

export const appDataDir = path.join(getDataHome(), appName);
ensureExists(appDataDir);
export const cacheDir = path.join(getCacheFolder(), appName);
ensureExists(cacheDir);
export const modCacheDir = path.join(cacheDir, 'mods');
ensureExists(modCacheDir);

export function copyFile(file: string, toDir: string): void {
  fs.copyFileSync(file, path.join(toDir, path.basename(file)));
}

export async function downloadFile(url: string, file: string): Promise<void> {
  const buffer: Buffer = await request(url, {
    method: 'GET',
    encoding: null,
  });
  fs.writeFileSync(file, buffer);
}
