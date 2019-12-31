import fs from 'fs';
import path from 'path';
import util from 'util';
import JSZip from 'jszip';
import {
  modCacheDir, copyFile, downloadFile, forEachAsync,
} from './utils';
import { getModDownloadLink } from './ficsitApp';

export interface Mod {
  mod_id: string;
  mod_reference: string;
  name: string;
  version: string;
  description: string;
  authors: Array<string>;
  objects: Array<ModObject>;
  dependencies?: object;
  optional_dependencies?: object;
  path?: string;
}

export interface ModObject {
  path: string;
  type: string;
  metadata?: object;
}

export class ModHandler {
  private satisfactoryPath: string;

  constructor(satisfactoryPath: string) {
    this.satisfactoryPath = satisfactoryPath;
  }

  getModsDir(): string {
    // SML 1.x
    return path.join(this.satisfactoryPath, 'FactoryGame', 'Binaries', 'Win64', 'mods');
    // SML 2.x
    // return path.join(this.satisfactoryPath, 'mods');
  }

  async installMod(modID: string, version: string): Promise<void> {
    const modPath = await ModHandler.getCachedMod(modID, version);
    const modsDir = this.getModsDir();
    copyFile(modPath, modsDir);
  }

  async uninstallMod(modID: string, version: string): Promise<void> {
    const modsDir = this.getModsDir();
    if (fs.existsSync(modsDir)) {
      await forEachAsync(fs.readdirSync(modsDir), async (file) => {
        const fullPath = path.join(modsDir, file);
        const mod = await ModHandler.getModFromFile(fullPath);
        if (mod.mod_id === modID && mod.version === version) {
          fs.unlinkSync(fullPath);
        }
      });
    }
  }

  async getInstalledMods(): Promise<Array<Mod>> {
    const modsDir = this.getModsDir();
    const installedModsPromises = Array<Promise<Mod>>();
    if (fs.existsSync(modsDir)) {
      fs.readdirSync(modsDir).forEach((file) => {
        const fullPath = path.join(modsDir, file);
        installedModsPromises.push(ModHandler.getModFromFile(fullPath));
      });
    }
    return Promise.all(installedModsPromises);
  }

  private static cachedMods = new Array<Mod>();
  private static cacheLoaded = false;

  static async getModFromFile(modPath: string): Promise<Mod> {
    return util.promisify(fs.readFile)(modPath)
      .then((data) => JSZip.loadAsync(data))
      .then((zip) => zip.file('data.json').async('text'))
      .then((data) => {
        const mod = JSON.parse(data) as Mod;
        mod.path = modPath;
        return mod;
      });
  }

  static async downloadMod(modID: string, version: string): Promise<string> {
    const downloadURL = await getModDownloadLink(modID, version);
    const filePath = path.join(modCacheDir, `${modID}_${version}.zip`);
    await downloadFile(downloadURL, filePath);
    return filePath;
  }

  static async getCachedMod(modID: string, version: string): Promise<string> {
    let modPath = (await ModHandler.getCachedMods())
      .find((mod) => mod.mod_id === modID && mod.version === version)?.path;
    if (!modPath) {
      modPath = await ModHandler.downloadMod(modID, version);
      await ModHandler.addModToCache(modPath);
    }
    return modPath;
  }

  static async getCachedMods(): Promise<Array<Mod>> {
    if (!ModHandler.cacheLoaded) {
      await ModHandler.loadCache();
    }
    return ModHandler.cachedMods;
  }

  static async loadCache(): Promise<void> {
    ModHandler.cacheLoaded = true;
    ModHandler.cachedMods = new Array<Mod>();
    const cacheAddPromises = Array<Promise<void>>();
    fs.readdirSync(modCacheDir).forEach((file) => {
      const fullPath = path.join(modCacheDir, file);
      cacheAddPromises.push(ModHandler.addModToCache(fullPath));
    });
    await Promise.all(cacheAddPromises);
  }

  private static async addModToCache(modFile: string): Promise<void> {
    ModHandler.cachedMods.push(await ModHandler.getModFromFile(modFile));
  }
}
