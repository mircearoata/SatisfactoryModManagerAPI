import fs from 'fs';
import path from 'path';
import { coerce, valid } from 'semver';
import {
  downloadFile, hashFile,
} from './utils';
import { getModVersion, getModName, getModDownloadLink } from './ficsitApp';
import { error, debug } from './logging';
import { modCacheDir } from './paths';
import { getModFromFile, Mod } from './mod';

let cachedMods = new Array<Mod>();
let cacheLoaded = false;

export function getCachedModPath(modReference: string, version: string): string {
  return path.join(modCacheDir, `${modReference}_${valid(coerce(version))}.smod`);
}

export function addModToCache(mod: Mod): void {
  cachedMods.removeWhere((cachedMod) => cachedMod.mod_reference === mod.mod_reference && cachedMod.version === mod.version);
  cachedMods.push(mod);
}

let isLoadingCache = false;

export async function loadCache(): Promise<void> {
  if (isLoadingCache) {
    return;
  }
  debug('Loading mod cache');
  isLoadingCache = true;
  cachedMods = new Array<Mod>();
  const cacheAddPromises = Array<Promise<void>>();
  fs.readdirSync(modCacheDir).forEach((file) => {
    const fullPath = path.join(modCacheDir, file);
    cacheAddPromises.push((async () => {
      try {
        const mod = await getModFromFile(fullPath);
        if (mod) {
          if (getCachedModPath(mod.mod_reference, mod.version) !== fullPath) {
            // Rename the externally added file to the expected filename format
            fs.renameSync(fullPath, getCachedModPath(mod.mod_reference, mod.version));
          }
          addModToCache(mod);
        }
      } catch (e) {
        fs.unlinkSync(fullPath);
        error(`Removing corrupt cached mod ${fullPath}`);
      }
    })());
  });
  await Promise.all(cacheAddPromises);
  cacheLoaded = true;
  isLoadingCache = false;
}

export async function getCachedMods(force = false): Promise<Array<Mod>> {
  while (isLoadingCache) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (force) {
    debug('Forcing cache reload');
    cachedMods = [];
    cacheLoaded = false;
  }
  if (!cacheLoaded) {
    await loadCache();
  }
  return cachedMods;
}

export async function getCachedMod(modReference: string, version: string): Promise<Mod | undefined> {
  return (await getCachedMods()).find((cachedMod) => (cachedMod.mod_reference === modReference) && cachedMod.version === version);
}

export async function getCachedModVersions(modReference: string): Promise<string[]> {
  return (await getCachedMods()).filter((cachedMod) => cachedMod.mod_reference === modReference)
    .map((mod) => mod.version);
}

export async function removeModFromCache(modReference: string, version: string): Promise<void> {
  const mod = (await getCachedMods())
    .find((cachedMod) => cachedMod.mod_reference === modReference && cachedMod.version === version);
  if (mod) {
    cachedMods.remove(mod);
    const modPath = getCachedModPath(modReference, version);
    fs.unlinkSync(modPath);
  }
}

export function clearCache(): void {
  cacheLoaded = false;
  cachedMods = new Array<Mod>();
}

const DOWNLOAD_MOD_ATTEMPTS = 3;

export async function downloadMod(modReference: string, version: string, attempt = 0): Promise<string> {
  if (attempt > DOWNLOAD_MOD_ATTEMPTS) {
    throw new Error(`${DOWNLOAD_MOD_ATTEMPTS} attempts to download ${modReference}@${version} failed`);
  }
  const ficsitAppModVersion = await getModVersion(modReference, version);
  const downloadURL = await getModDownloadLink(modReference, version);
  const filePath = getCachedModPath(modReference, version);
  try {
    await downloadFile(downloadURL, filePath, await getModName(modReference), version);
    const isFlieHashMatching = hashFile(filePath) === ficsitAppModVersion.hash;
    if (isFlieHashMatching) {
      return filePath;
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return downloadMod(modReference, version, attempt + 1);
  } catch (e) {
    error(`Error downloading mod: ${e.message}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return downloadMod(modReference, version, attempt + 1);
  }
}

export async function isCachedModFileLatest(modReference: string, version: string): Promise<boolean> {
  const modPath = getCachedModPath(modReference, version);
  if (!modPath) return false;
  const ficsitAppModVersion = await getModVersion(modReference, version);
  return fs.existsSync(modPath) && fs.statSync(modPath).mtime >= ficsitAppModVersion.created_at;
}

export async function isCachedModFileValid(modReference: string, version: string): Promise<boolean> {
  const modPath = getCachedModPath(modReference, version);
  if (!modPath) return false;
  const ficsitAppModVersion = await getModVersion(modReference, version);
  return fs.existsSync(modPath) && hashFile(modPath) === ficsitAppModVersion.hash;
}

export async function verifyCachedModFile(modReference: string, version: string): Promise<void> {
  const modPath = getCachedModPath(modReference, version);
  const isLatest = await isCachedModFileLatest(modReference, version);
  const isValid = await isCachedModFileValid(modReference, version);
  if (!isLatest || !isValid) {
    if (!fs.existsSync(modPath)) {
      debug(`${modReference}@${version} is not downloaded. Downloading now.`);
    } else {
      if (!isLatest) {
        debug(`${modReference}@${version} was changed by the author. Redownloading.`);
      }
      if (!isValid) {
        debug(`${modReference}@${version} is corrupted. Redownloading.`);
      }
    }
    await downloadMod(modReference, version);
    const mod = await getModFromFile(modPath);
    if (!mod) {
      throw Error(`Downloaded mods file is invalid: ${modPath}`);
    }
    await addModToCache(mod);
  }
}
