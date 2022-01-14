import fs from 'fs';
import path from 'path';
import StreamZip from 'node-stream-zip';
import { valid } from 'semver';
import {
  copyFile, downloadFile, hashFile, SMLID,
} from './utils';
import { getModDownloadLink, getModVersion, getModName } from './ficsitApp';
import { InvalidModFileError } from './errors';
import { error, debug } from './logging';
import { ensureExists, modCacheDir } from './paths';
import { SMLVersion } from './smlHandler';
import { UPlugin } from './uplugin';

let cachedMods = new Array<Mod>();
let cacheLoaded = false;

const modExtensions = ['.smod'];
const SMM_TRACKED_FILE = '.smm';

function getModFromUPlugin(mod_reference: string, uplugin: UPlugin): Mod {
  const mod = {
    mod_id: mod_reference,
    mod_reference,
    name: uplugin.FriendlyName,
    version: uplugin.SemVersion || valid(uplugin.VersionName) || `${uplugin.Version}.0.0`,
    description: uplugin.Description,
    authors: [...(uplugin.CreatedBy?.split(',').map((author) => author.trim()) || []), uplugin.CreatedByURL?.trim()].filter((str) => str && str.length > 0),
    objects: [],
    dependencies: Object.assign({}, ...(uplugin.Plugins?.filter((depPlugin) => !depPlugin.bOptional).map((depPlugin) => ({ [depPlugin.Name]: depPlugin.SemVersion || '*' })) || [])),
    optional_dependencies: Object.assign({}, ...(uplugin.Plugins?.filter((depPlugin) => depPlugin.bOptional).map((depPlugin) => ({ [depPlugin.Name]: depPlugin.SemVersion || '*' })) || [])),
  } as Mod;
  return mod;
}

export async function getModFromFile(modPath: string): Promise<Mod | undefined> {
  if (modExtensions.includes(path.extname(modPath))) {
    const zipData = new StreamZip({ file: modPath });
    await new Promise((resolve, reject) => { zipData.on('ready', resolve); zipData.on('error', (e) => { zipData.close(); reject(e); }); });
    if (zipData.entry('data.json')) {
      // SML 2.x
      const mod = JSON.parse(zipData.entryDataSync('data.json').toString('utf8')) as Mod;
      zipData.close();
      if (!mod.mod_reference) {
        return undefined;
      }
      mod.path = modPath;
      return mod;
    }
    // SML 3.x
    const uplugin = Object.entries(zipData.entries()).find(([name]) => name.endsWith('.uplugin'));
    if (uplugin) {
      const upluginContent = JSON.parse(zipData.entryDataSync(uplugin[0]).toString('utf8')) as UPlugin;
      zipData.close();
      const mod = getModFromUPlugin(path.basename(uplugin[0], '.uplugin'), upluginContent);
      mod.path = modPath;
      return mod;
    }
    zipData.close();
  }
  throw new InvalidModFileError(`Invalid mod file ${modPath}. Extension is ${path.extname(modPath)}, required ${modExtensions.join(', ')}`);
}

export async function addModToCache(modFile: string): Promise<Mod | undefined> {
  try {
    const mod = await getModFromFile(modFile);
    if (mod) {
      cachedMods.push(mod);
    }
    return mod;
  } catch (e) {
    fs.unlinkSync(modFile);
    error(`Removing corrupt cached mod ${modFile}`);
    return undefined;
  }
}

export async function loadCache(): Promise<void> {
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
  cacheLoaded = true;
}

const DOWNLOAD_MOD_ATTEMPTS = 3;

export async function downloadMod(modReference: string, version: string, attempt = 0): Promise<string> {
  if (attempt > DOWNLOAD_MOD_ATTEMPTS) {
    throw new Error(`${DOWNLOAD_MOD_ATTEMPTS} attempts to download ${modReference}@${version} failed`);
  }
  const downloadURL = await getModDownloadLink(modReference, version);
  const filePath = path.join(modCacheDir, `${modReference}_${version}.smod`);
  try {
    await downloadFile(downloadURL, filePath, await getModName(modReference), version);
    await getModFromFile(filePath);
    const ficsitAppModVersion = await getModVersion(modReference, version);
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

let isLoadingCache = false;

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
    debug('Loading mod cache');
    isLoadingCache = true;
    await loadCache();
    isLoadingCache = false;
  }
  return cachedMods;
}

export async function getCachedMod(modReference: string, version: string, skipIntegrityCheck = false): Promise<Mod | undefined> {
  const mod = (await getCachedMods())
    .find((cachedMod) => (cachedMod.mod_reference === modReference) && cachedMod.version === version);
  let isModFileLatest;
  let isFileHashMatching;
  if (!skipIntegrityCheck) {
    const ficsitAppModVersion = await getModVersion(modReference, version);
    isModFileLatest = mod && (!mod.path || fs.statSync(mod.path).mtime >= ficsitAppModVersion.created_at);
    isFileHashMatching = mod && mod.path && hashFile(mod.path) === ficsitAppModVersion.hash;
  } else {
    isModFileLatest = true;
    isFileHashMatching = true;
  }
  if (!mod || !isModFileLatest || !isFileHashMatching) {
    if (mod && !isModFileLatest) {
      debug(`${modReference}@${version} was changed by the author. Redownloading.`);
      cachedMods.remove(mod);
    } else if (mod && !isFileHashMatching) {
      debug(`${modReference}@${version} is corrupted. Redownloading.`);
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
  return (await getCachedMods()).filter((cachedMod) => cachedMod.mod_reference === modReference)
    .map((mod) => mod.version);
}

export async function removeModFromCache(modReference: string, version: string): Promise<void> {
  const mod = (await getCachedMods())
    .find((cachedMod) => cachedMod.mod_reference === modReference && cachedMod.version === version);
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
}

export async function installMod(modReference: string, version: string, modsDir: string, smlVersion: SMLVersion): Promise<void> {
  const modPath = (await getCachedMod(modReference, version))?.path;
  if (modPath) {
    if (smlVersion === SMLVersion.v2_x) {
      copyFile(modPath, modsDir);
    } else if (smlVersion === SMLVersion.v3_x) {
      // eslint-disable-next-line new-cap
      const zipData = new StreamZip.async({ file: modPath });
      const extractPath = path.join(modsDir, modReference);
      ensureExists(extractPath);
      await zipData.extract(null, extractPath);
      await zipData.close();
      fs.writeFileSync(path.join(extractPath, SMM_TRACKED_FILE), '');
    } else {
      throw new Error('Invalid smlVersion');
    }
  }
}

export async function uninstallMods(modReferences: Array<string>, modsDir: string, smlVersion: SMLVersion): Promise<void> {
  if (fs.existsSync(modsDir)) {
    if (smlVersion === SMLVersion.v2_x) {
      await Promise.all(fs.readdirSync(modsDir).map(async (file) => {
        const fullPath = path.join(modsDir, file);
        if (modExtensions.includes(path.extname(fullPath))) {
          try {
            const mod = await getModFromFile(fullPath);
            if (mod && modReferences.includes(mod.mod_reference)) {
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
              }
            }
          } catch (e) {
            error(`Corrupt installed mod found ${fullPath}`);
          }
        }
      }));
    } else if (smlVersion === SMLVersion.v3_x) {
      await Promise.all(fs.readdirSync(modsDir).map(async (dir) => {
        if (dir === SMLID) return;
        const fullPath = path.join(modsDir, dir);
        const upluginPath = path.join(fullPath, `${dir}.uplugin`);
        if (fs.existsSync(upluginPath)) {
          try {
            const mod = getModFromUPlugin(dir, JSON.parse(fs.readFileSync(upluginPath, { encoding: 'utf8' })) as UPlugin);
            if (modReferences.includes(mod.mod_reference)) {
              fs.rmdirSync(fullPath, { recursive: true });
            }
          } catch (e) {
            error(`Error reading mod ${fullPath}`);
          }
        }
      }));
    } else {
      throw new Error('Invalid smlVersion');
    }
  }
}

export async function getInstalledMods(modsDir: string | undefined, smlVersion: SMLVersion): Promise<Array<Mod>> {
  if (!modsDir) {
    return [];
  }
  const installedModsPromises = new Array<Promise<Mod | undefined>>();
  if (fs.existsSync(modsDir)) {
    if (smlVersion === SMLVersion.v2_x) {
      fs.readdirSync(modsDir).forEach((file) => {
        const fullPath = path.join(modsDir, file);
        if (modExtensions.includes(path.extname(fullPath))) {
          installedModsPromises.push((async () => {
            try {
              return await getModFromFile(fullPath);
            } catch (e) {
              error(`Corrupt installed mod found ${fullPath}`);
            }
            return undefined;
          })());
        }
      });
    } else if (smlVersion === SMLVersion.v3_x) {
      fs.readdirSync(modsDir).forEach((dir) => {
        if (dir === SMLID) return;
        const fullPath = path.join(modsDir, dir);
        if (!fs.existsSync(path.join(fullPath, SMM_TRACKED_FILE))) return;
        const upluginPath = path.join(fullPath, `${dir}.uplugin`);
        if (fs.existsSync(upluginPath)) {
          try {
            const mod = getModFromUPlugin(dir, JSON.parse(fs.readFileSync(upluginPath, { encoding: 'utf8' })) as UPlugin);
            mod.path = fullPath;
            installedModsPromises.push(Promise.resolve(mod));
          } catch (e) {
            error(`Error reading mod ${fullPath}`);
          }
        }
      });
    } else {
      throw new Error('Invalid smlVersion');
    }
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
