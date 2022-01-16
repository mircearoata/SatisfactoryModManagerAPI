import path from 'path';
import fs from 'fs';
import { valid, coerce } from 'semver';
import { ModNotFoundError } from '../errors';
import { debug } from '../logging';
import { downloadCacheDir, ensureExists } from '../paths';

export const bootstrapperCacheDir = path.join(downloadCacheDir, 'bootstrapperVersions');
ensureExists(bootstrapperCacheDir);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function downloadBootstrapper(version: string): Promise<void> {
  throw new Error('SML 2.x is not supported');
}

export async function getBootstrapperVersionCache(version: string): Promise<string> {
  const validVersion = valid(coerce(version));
  if (!validVersion) {
    throw new ModNotFoundError(`bootstrapper@${version} not found.`, 'bootstrapper', version);
  }
  const bootstrapperVersionCacheDir = path.join(bootstrapperCacheDir, validVersion);
  if (!fs.existsSync(bootstrapperVersionCacheDir)) {
    debug(`bootstrapper@${version} is not cached. Downloading`);
    await downloadBootstrapper(validVersion);
  }
  return bootstrapperVersionCacheDir;
}

export function clearBootstrapperCache(): void {
  fs.readdirSync(bootstrapperCacheDir).forEach((file) => {
    const fullPath = path.join(bootstrapperCacheDir, file);
    fs.rmSync(fullPath, { recursive: true });
  });
}

const CACHE_LIFETIME = 30 * 24 * 60 * 60 * 1000; // 30 days

export function removeUnusedBootstrapperCache(): void {
  const now = new Date();
  fs.readdirSync(bootstrapperCacheDir).forEach((file) => {
    const fullPath = path.join(bootstrapperCacheDir, file);
    if (now.getTime() - fs.statSync(fullPath).mtime.getTime() >= CACHE_LIFETIME) {
      fs.rmSync(fullPath, { recursive: true });
    }
  });
}
