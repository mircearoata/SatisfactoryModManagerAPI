import fs from 'fs';
import path from 'path';
import util from 'util';
import JSZip from 'jszip';
import {
  modCacheDir, copyFile, downloadFile, forEachAsync,
} from './utils';
import { getModDownloadLink } from './ficsitApp';
import { InvalidModFileError } from './errors';
import { error, debug } from './logging';

let cachedMods = new Array<Mod>();
let cacheLoaded = false;

const modExtensions = ['.zip', '.smod'];

export async function getModFromFile(modPath: string): Promise<Mod> {
  if (modExtensions.includes(path.extname(modPath))) {
    return util.promisify(fs.readFile)(modPath)
      .then((data) => JSZip.loadAsync(data))
      .then((zip) => zip.file('data.json').async('text'))
      .then((data) => {
        const mod = JSON.parse(data) as Mod;
        mod.path = modPath;
        return mod;
      })
      .catch((e) => {
        error(e);
        const mod = {
          name: 'Error reading mod file',
          description: e.message,
          path: modPath,
        } as Mod;
        return mod;
      });
  }
  throw new InvalidModFileError(`Invalid mod file ${modPath}. Extension is ${path.extname(modPath)}, required ${modExtensions.join(', ')}`);
}

export async function addModToCache(modFile: string): Promise<void> {
  cachedMods.push(await getModFromFile(modFile));
}

export async function loadCache(): Promise<void> {
  cacheLoaded = true;
  cachedMods = new Array<Mod>();
  const cacheAddPromises = Array<Promise<void>>();
  fs.readdirSync(modCacheDir).forEach((file) => {
    const fullPath = path.join(modCacheDir, file);
    cacheAddPromises.push(addModToCache(fullPath));
  });
  await Promise.all(cacheAddPromises);
}

export async function downloadMod(modID: string, version: string): Promise<string> {
  const downloadURL = await getModDownloadLink(modID, version);
  const filePath = path.join(modCacheDir, `${modID}_${version}.smod`);
  await downloadFile(downloadURL, filePath);
  const modInfo = await getModFromFile(filePath);
  const modReferenceFilePath = path.join(modCacheDir, `${modInfo.mod_reference}_${version}.smod`);
  fs.renameSync(filePath, modReferenceFilePath);
  return modReferenceFilePath;
}

export async function getCachedMods(): Promise<Array<Mod>> {
  if (!cacheLoaded) {
    debug('Loading mod cache');
    await loadCache();
  }
  return cachedMods;
}

export async function getCachedModFile(modID: string, version: string): Promise<string> {
  let modPath = (await getCachedMods())
    .find((mod) => mod.mod_id === modID && mod.version === version)?.path;
  if (!modPath) {
    debug(`${modID}@${version} is not downloaded. Downloading now.`);
    modPath = await downloadMod(modID, version);
    await addModToCache(modPath);
  }
  return modPath;
}

export async function getCachedMod(modID: string, version: string): Promise<Mod> {
  return getModFromFile(await getCachedModFile(modID, version));
}

export interface Mod {
  mod_id: string;
  mod_reference: string;
  name: string;
  version: string;
  description: string;
  authors: Array<string>;
  objects: Array<ModObject>;
  dependencies?: { [modID: string]: string };
  optional_dependencies?: { [modID: string]: string };
  path?: string;
  sml_version?: string;
}

export interface ModObject {
  path: string;
  type: string;
  metadata?: object;
}

export async function installMod(modID: string, version: string, modsDir: string): Promise<void> {
  const modPath = await getCachedModFile(modID, version);
  copyFile(modPath, modsDir);
}

export async function uninstallMod(modID: string, modsDir: string): Promise<void> {
  if (fs.existsSync(modsDir)) {
    await forEachAsync(fs.readdirSync(modsDir), async (file) => {
      const fullPath = path.join(modsDir, file);
      if (modExtensions.includes(path.extname(fullPath))) {
        const mod = await getModFromFile(fullPath);
        if (mod.mod_id === modID) {
          fs.unlinkSync(fullPath);
        }
      }
    });
  }
}

export async function getInstalledMods(modsDir: string | undefined): Promise<Array<Mod>> {
  if (!modsDir) {
    return [];
  }
  const installedModsPromises = Array<Promise<Mod>>();
  if (fs.existsSync(modsDir)) {
    fs.readdirSync(modsDir).forEach((file) => {
      const fullPath = path.join(modsDir, file);
      if (modExtensions.includes(path.extname(fullPath))) {
        installedModsPromises.push(getModFromFile(fullPath));
      }
    });
  }
  return Promise.all(installedModsPromises);
}

export function clearCache(): void {
  cacheLoaded = false;
  cachedMods = new Array<Mod>();
}
