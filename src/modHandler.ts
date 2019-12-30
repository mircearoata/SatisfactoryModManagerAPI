import fs from 'fs';
import path from 'path';
import util from 'util';
import { Mod } from './mod';
import { modCacheDir } from './utils';
import { downloadMod } from './ficsitApp';

import JSZip = require('jszip');

export async function getModFromZip(zipPath: string): Promise<Mod> {
  return util.promisify(fs.readFile)(zipPath)
    .then((data) => JSZip.loadAsync(data))
    .then((zip) => zip.file('data.json').async('text'))
    .then((data) => {
      const mod = JSON.parse(data) as Mod;
      mod.path = zipPath;
      return mod;
    });
}

const cachedMods = new Array<Mod>();

export async function loadCache(): Promise<Array<Mod>> {
  if (cachedMods.length !== 0) { return cachedMods; }
  const cachePromises = Array<Promise<Mod>>();
  fs.readdirSync(modCacheDir).forEach((file) => {
    const fullPath = path.join(modCacheDir, file);
    cachePromises.push(getModFromZip(fullPath));
  });
  cachedMods.length = 0;
  (await Promise.all(cachePromises)).forEach((mod) => {
    cachedMods.push(mod);
  });
  return cachedMods;
}

export async function getModZipCached(modID: string, version: string): Promise<string | undefined> {
  return cachedMods.find((mod) => mod.mod_id === modID && mod.version === version)?.path;
}

export async function installMod(modID: string, version: string): Promise<void> {
  let zipPath = await getModZipCached(modID, version);
  if (!zipPath) {
    zipPath = await downloadMod(modID, version);
  }
  console.log(zipPath);
}
