import fs from 'fs';
import path from 'path';
import util from 'util';
import JSZip from 'jszip';
import {
  modCacheDir, copyFile, downloadFile,
} from './utils';
import { getModDownloadLink, getModVersion, getModName } from './ficsitApp';
import { InvalidModFileError } from './errors';
import { error, debug } from './logging';

let cachedMods = new Array<Mod>();
let cacheLoaded = false;

const modExtensions = ['.zip', '.smod'];

export async function getModFromFile(modPath: string): Promise<Mod | undefined> {
  if (modExtensions.includes(path.extname(modPath))) {
    const zipData = fs.readFileSync(modPath);
    return JSZip.loadAsync(zipData)
      .then((zip) => zip.file('data.json').async('text'))
      .then((data) => {
        const mod = JSON.parse(data) as Mod;
        if (!mod.mod_id || !mod.mod_reference) {
          return undefined;
        }
        mod.path = modPath;
        return mod;
      })
      .catch((e) => {
        error(e);
        return undefined;
      });
  }
  throw new InvalidModFileError(`Invalid mod file ${modPath}. Extension is ${path.extname(modPath)}, required ${modExtensions.join(', ')}`);
}

export async function addModToCache(modFile: string): Promise<Mod | undefined> {
  const mod = await getModFromFile(modFile);
  if (mod) {
    cachedMods.push(mod);
  }
  return mod;
}

export async function loadCache(): Promise<void> {
  cacheLoaded = true;
  cachedMods = new Array<Mod>();
  const cacheAddPromises = Array<Promise<void>>();
  fs.readdirSync(modCacheDir).forEach((file) => {
    const fullPath = path.join(modCacheDir, file);
    cacheAddPromises.push(new Promise((resolve) => {
      addModToCache(fullPath).then(() => {
        resolve();
      });
    }));
  });
  await Promise.all(cacheAddPromises);
}

export async function downloadMod(modReference: string, version: string): Promise<string> {
  const downloadURL = await getModDownloadLink(modReference, version);
  const filePath = path.join(modCacheDir, `${modReference}_${version}.smod`);
  await downloadFile(downloadURL, filePath, `${await getModName(modReference)}@${version}`);
  const modInfo = await getModFromFile(filePath);
  if (modInfo) {
    const modReferenceFilePath = path.join(modCacheDir, `${modInfo.mod_reference}_${version}.smod`);
    fs.renameSync(filePath, modReferenceFilePath);
    return modReferenceFilePath;
  }
  return '';
}

export async function getCachedMods(): Promise<Array<Mod>> {
  if (!cacheLoaded) {
    debug('Loading mod cache');
    await loadCache();
  }
  return cachedMods;
}

export async function getCachedMod(modReference: string, version: string): Promise<Mod | undefined> {
  const mod = (await getCachedMods())
    .find((cachedMod) => (cachedMod.mod_reference === modReference || cachedMod.mod_id === modReference) && cachedMod.version === version);
  const ficsitAppModVersionDate = (await getModVersion(modReference, version)).created_at;
  const isModFileLatest = mod && (!mod.path || fs.statSync(mod.path).mtime >= ficsitAppModVersionDate);
  if (!mod || !isModFileLatest) {
    if (mod && !isModFileLatest) {
      debug(`${modReference}@${version} was changed by the author. Redownloading.`);
      cachedMods.remove(mod);
    } else {
      debug(`${modReference}@${version} is not downloaded. Downloading now.`);
    }
    const modPath = await downloadMod(modReference, version);
    if (!modPath) {
      return undefined;
    }
    return addModToCache(modPath);
  }
  return mod;
}

export async function getCachedModVersions(modReference: string): Promise<string[]> {
  return (await getCachedMods()).filter((cachedMod) => (cachedMod.mod_reference === modReference || cachedMod.mod_id === modReference))
    .map((mod) => mod.version);
}

export async function removeModFromCache(modReference: string, version: string): Promise<void> {
  const mod = (await getCachedMods())
    .find((cachedMod) => (cachedMod.mod_reference === modReference || cachedMod.mod_id === modReference) && cachedMod.version === version);
  if (mod) {
    cachedMods.remove(mod);
    if (mod.path) {
      fs.unlinkSync(mod.path);
    }
  }
}

export interface Mod {
  mod_id: string;
  mod_reference: string;
  name: string;
  version: string;
  description: string;
  authors: Array<string>;
  objects: Array<ModObject>;
  dependencies?: { [modReference: string]: string };
  optional_dependencies?: { [modReference: string]: string };
  path?: string;
  sml_version?: string;
}

export interface ModObject {
  path: string;
  type: string;
  metadata?: object;
}

export async function installMod(modReference: string, version: string, modsDir: string): Promise<void> {
  const modPath = (await getCachedMod(modReference, version))?.path;
  if (modPath) {
    copyFile(modPath, modsDir);
  }
}

export async function uninstallMod(modReference: string, modsDir: string): Promise<void> {
  if (fs.existsSync(modsDir)) {
    await Promise.all(fs.readdirSync(modsDir).map(async (file) => {
      const fullPath = path.join(modsDir, file);
      if (modExtensions.includes(path.extname(fullPath))) {
        const mod = await getModFromFile(fullPath);
        if (mod && (mod.mod_reference === modReference || mod.mod_id === modReference)) {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        }
      }
    }));
  }
}

export async function getInstalledMods(modsDir: string | undefined): Promise<Array<Mod>> {
  if (!modsDir) {
    return [];
  }
  const installedModsPromises = new Array<Promise<Mod | undefined>>();
  if (fs.existsSync(modsDir)) {
    fs.readdirSync(modsDir).forEach((file) => {
      const fullPath = path.join(modsDir, file);
      if (modExtensions.includes(path.extname(fullPath))) {
        installedModsPromises.push(getModFromFile(fullPath));
      }
    });
  }
  const mods = new Array<Mod>();
  (await Promise.all(installedModsPromises)).forEach((mod) => {
    if (mod) {
      mods.push(mod);
    }
  });
  return mods;
}

export function clearCache(): void {
  cacheLoaded = false;
  cachedMods = new Array<Mod>();
}
