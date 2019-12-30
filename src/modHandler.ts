import fs from 'fs';
import path from 'path';
import util from 'util';
import { Mod } from './mod';
import {
  modCacheDir, ensureExists, copyFile, downloadFile,
} from './utils';
import { getModDownloadLink } from './ficsitApp';

import JSZip = require('jszip');

export default class ModHandler {
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
    ensureExists(await this.getModsDir());
    copyFile(modPath, this.getModsDir());
  }

  async uninstallMod(modID: string, version: string): Promise<void> {
    fs.readdirSync(this.getModsDir()).forEach(async (file) => {
      const fullPath = path.join(this.getModsDir(), file);
      const mod = await ModHandler.getModFromFile(fullPath);
      if (mod.mod_id === modID && mod.version === version) {
        fs.unlinkSync(fullPath);
      }
    });
  }

  async getInstalledMods(): Promise<Array<Mod>> {
    const modsDir = await this.getModsDir();
    const installedModsPromises = Array<Promise<Mod>>();
    fs.readdirSync(modsDir).forEach((file) => {
      const fullPath = path.join(modsDir, file);
      installedModsPromises.push(ModHandler.getModFromFile(fullPath));
    });
    return Promise.all(installedModsPromises);
  }

  static cachedMods = new Array<Mod>();

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
    let modPath = ModHandler.cachedMods
      .find((mod) => mod.mod_id === modID && mod.version === version)?.path;
    if (!modPath) {
      modPath = await ModHandler.downloadMod(modID, version);
      ModHandler.cachedMods.push(await ModHandler.getModFromFile(modPath));
    }
    return modPath;
  }

  static async getCachedMods(): Promise<Array<Mod>> {
    if (ModHandler.cachedMods.length !== 0) { return ModHandler.cachedMods; }
    const cachePromises = Array<Promise<Mod>>();
    fs.readdirSync(modCacheDir).forEach((file) => {
      const fullPath = path.join(modCacheDir, file);
      cachePromises.push(ModHandler.getModFromFile(fullPath));
    });
    ModHandler.cachedMods.length = 0;
    (await Promise.all(cachePromises)).forEach((mod) => {
      ModHandler.cachedMods.push(mod);
    });
    return ModHandler.cachedMods;
  }
}
