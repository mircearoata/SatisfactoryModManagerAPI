import path from 'path';
import fs from 'fs';
import { valid, coerce, satisfies } from 'semver';
import {
  downloadFile, isValidZip,
} from '../utils';
import { ModNotFoundError } from '../errors';
import { getSMLVersionInfo } from '../ficsitApp';
import { debug } from '../logging';
import { downloadCacheDir, ensureExists } from '../paths';
import { SMLZipFileName } from './sml';

export const smlCacheDir = path.join(downloadCacheDir, 'smlVersions');
ensureExists(smlCacheDir);

async function downloadSML(version: string): Promise<void> {
  const smlReleaseURL = (await getSMLVersionInfo(version))?.link;
  if (!smlReleaseURL) {
    throw new ModNotFoundError(`SML@${version} not found.`, 'SML', version);
  }
  const smlVersionCacheDir = path.join(smlCacheDir, version);
  const smlZipCacheFile = path.join(smlVersionCacheDir, SMLZipFileName);
  const smlZipDownloadLink = `${smlReleaseURL.replace('/tag/', '/download/')}/SML.zip`;
  await downloadFile(smlZipDownloadLink, smlZipCacheFile, 'SML', version);
}

export async function getSMLVersionCache(version: string): Promise<string> {
  const validVersion = valid(coerce(version));
  if (!validVersion) {
    throw new ModNotFoundError(`SML@${version} not found.`, 'SML', version);
  }
  if (!satisfies(validVersion, '>=3.0.0')) {
    throw new Error('SML 2.x is not supported.');
  }
  const smlVersionCacheDir = path.join(smlCacheDir, validVersion);
  const smlZipCacheFile = path.join(smlVersionCacheDir, SMLZipFileName);
  if (!fs.existsSync(smlZipCacheFile) || !await isValidZip(smlZipCacheFile)) {
    debug(`SML@${validVersion} is not cached. Downloading`);
    await downloadSML(validVersion);
  }
  return smlVersionCacheDir;
}

export function clearSMLCache(): void {
  fs.readdirSync(smlCacheDir).forEach((file) => {
    const fullPath = path.join(smlCacheDir, file);
    fs.rmSync(fullPath, { recursive: true });
  });
}

const CACHE_LIFETIME = 30 * 24 * 60 * 60 * 1000; // 30 days

export function removeUnusedSMLCache(): void {
  const now = new Date();
  fs.readdirSync(smlCacheDir).forEach((file) => {
    const fullPath = path.join(smlCacheDir, file);
    if (now.getTime() - fs.statSync(fullPath).mtime.getTime() >= CACHE_LIFETIME) {
      fs.rmSync(fullPath, { recursive: true });
    }
  });
}
