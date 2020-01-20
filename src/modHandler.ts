import fs from 'fs';
import path from 'path';
import util from 'util';
import JSZip from 'jszip';
import {
  modCacheDir, copyFile, downloadFile, forEachAsync,
} from './utils';
import { getModDownloadLink } from './ficsitApp';

let cachedMods = new Array<Mod>();
let cacheLoaded = false;

export async function getModFromFile(modPath: string): Promise<Mod> {
  return util.promisify(fs.readFile)(modPath)
    .then((data) => JSZip.loadAsync(data))
    .then((zip) => zip.file('data.json').async('text'))
    .then((data) => {
      const mod = JSON.parse(data) as Mod;
      mod.path = modPath;
      return mod;
    });
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
  const filePath = path.join(modCacheDir, `${modID}_${version}.zip`);
  await downloadFile(downloadURL, filePath);
  return filePath;
}

export async function getCachedMods(): Promise<Array<Mod>> {
  if (!cacheLoaded) {
    await loadCache();
  }
  return cachedMods;
}

export async function getCachedModFile(modID: string, version: string): Promise<string> {
  let modPath = (await getCachedMods())
    .find((mod) => mod.mod_id === modID && mod.version === version)?.path;
  if (!modPath) {
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
      const mod = await getModFromFile(fullPath);
      if (mod.mod_id === modID) {
        fs.unlinkSync(fullPath);
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
      installedModsPromises.push(getModFromFile(fullPath));
    });
  }
  return Promise.all(installedModsPromises);
}
