import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { eq } from 'semver';
import * as MH from './modHandler';
import * as SH from './smlHandler';
import * as BH from './bootstrapperHandler';
import {
  FicsitAppVersion, FicsitAppMod, FicsitAppSMLVersion, FicsitAppBootstrapperVersion,
  getModReferenceFromId, getModVersions, getAvailableSMLVersions, getAvailableBootstrapperVersions,
} from './ficsitApp';
import {
  ManifestItem, mutateManifest, readManifest, readLockfile, getItemsList, writeManifest, writeLockfile, ManifestVersion,
} from './manifest';
import { ItemVersionList } from './lockfile';
import {
  filterObject, mergeArrays, isRunning, ensureExists, configFolder, dirs, deleteFolderRecursive, validAndGreater,
} from './utils';
import {
  debug, info, error,
} from './logging';
import {
  GameRunningError, InvalidConfigError,
} from './errors';

export function getConfigFolderPath(configName: string): string {
  const configPath = path.join(configFolder, configName);
  ensureExists(configPath);
  return configPath;
}

export function configExists(configName: string): boolean {
  const configPath = path.join(configFolder, configName);
  return fs.existsSync(configPath);
}

const VANILLA_CONFIG_NAME = 'vanilla';
const MODDED_CONFIG_NAME = 'modded';
const DEVELOPMENT_CONFIG_NAME = 'development';

const CacheRelativePath = '.cache';

export function getInstallHash(satisfactoryPath: string): string {
  return createHash('sha256').update(satisfactoryPath, 'utf8').digest('hex');
}

export interface ItemUpdate {
  item: string;
  currentVersion: string;
  version: string;
  releases: Array<FicsitAppVersion | FicsitAppSMLVersion | FicsitAppBootstrapperVersion>;
}

export class SatisfactoryInstall {
  name: string;
  version: string;
  installLocation: string;
  launchPath: string;

  private _config = MODDED_CONFIG_NAME;

  constructor(name: string, version: string, installLocation: string, launchPath: string) {
    this.installLocation = installLocation;

    this.name = name;
    this.version = version;
    this.launchPath = launchPath;
  }

  private async _getInstalledMismatches(items: ItemVersionList):
  Promise<{ install: ItemVersionList; uninstall: Array<string>}> {
    const installedSML = SH.getSMLVersion(this.installLocation);
    const installedBootstrapper = BH.getBootstrapperVersion(this.installLocation);
    const installedMods = await MH.getInstalledMods(SH.getModsDir(this.installLocation));
    const mismatches: { install: ItemVersionList; uninstall: Array<string>} = {
      install: {},
      uninstall: [],
    };

    if (installedSML !== items[SH.SMLID]) {
      if (!items[SH.SMLID] || (installedSML && items[SH.SMLID])) {
        mismatches.uninstall.push(SH.SMLID);
      }
      if (items[SH.SMLID]) {
        mismatches.install[SH.SMLID] = items[SH.SMLID];
      }
    }

    if (installedBootstrapper !== items[BH.BootstrapperID]) {
      if (!items[BH.BootstrapperID] || (installedBootstrapper && items[BH.BootstrapperID])) {
        mismatches.uninstall.push(BH.BootstrapperID);
      }
      if (items[BH.BootstrapperID]) {
        mismatches.install[BH.BootstrapperID] = items[BH.BootstrapperID];
      }
    }

    const allMods = mergeArrays(Object.keys(items)
      .filter((item) => item !== SH.SMLID && item !== BH.BootstrapperID),
    installedMods.map((mod) => mod.mod_reference));
    allMods.forEach((mod) => {
      const installedModVersion = installedMods
        .find((installedMod) => installedMod.mod_reference === mod)?.version;
      if (installedModVersion !== items[mod]) {
        if (!items[mod] || (installedModVersion && items[mod])) {
          mismatches.uninstall.push(mod);
        }
        if (items[mod]) {
          mismatches.install[mod] = items[mod];
        }
      }
    });

    return mismatches;
  }

  async validateInstall(items: ItemVersionList): Promise<void> {
    debug(`Items: ${JSON.stringify(items)}`);
    const mismatches = await this._getInstalledMismatches(items);
    debug(`Mismatches: ${JSON.stringify(mismatches)}`);
    const modsDir = SH.getModsDir(this.installLocation);
    mismatches.uninstall.forEach((id) => debug(`Removing ${id} from Satisfactory install`));
    await MH.uninstallMods(mismatches.uninstall, modsDir);
    if (mismatches.uninstall.includes(SH.SMLID)) {
      debug('Removing SML from Satisfactory install');
      await SH.uninstallSML(this.installLocation);
    }
    if (mismatches.uninstall.includes(BH.BootstrapperID)) {
      debug('Removing Bootstrapper from Satisfactory install');
      await BH.uninstallBootstrapper(this.installLocation);
    }
    if (mismatches.install[SH.SMLID]) {
      debug('Copying SML to Satisfactory install');
      await SH.installSML(mismatches.install[SH.SMLID], this.installLocation);
    }
    if (mismatches.install[BH.BootstrapperID]) {
      debug('Copying Bootstrapper to Satisfactory install');
      await BH.installBootstrapper(mismatches.install[BH.BootstrapperID], this.installLocation);
    }
    await Object.entries(mismatches.install).forEachAsync(async (modInstall) => {
      const modInstallID = modInstall[0];
      const modInstallVersion = modInstall[1];
      if (modInstallID !== SH.SMLID && modInstallID !== BH.BootstrapperID) {
        if (modsDir) {
          debug(`Copying ${modInstallID}@${modInstallVersion} to Satisfactory install`);
          await MH.installMod(modInstallID, modInstallVersion, modsDir);
        }
      }
    });
  }

  async manifestMutate(install: Array<ManifestItem>, uninstall: Array<string>, update: Array<string>): Promise<void> {
    if (this._config === VANILLA_CONFIG_NAME && (install.length > 0 || update.length > 0)) {
      throw new InvalidConfigError('Cannot modify vanilla config. Use "modded" config or create a new config');
    }
    if (!await SatisfactoryInstall.isGameRunning()) {
      debug(`install: [${install.map((item) => (item.version ? `${item.id}@${item.version}` : item.id)).join(', ')}], uninstall: [${uninstall.join(', ')}], update: [${update.join(', ')}]`);
      const currentManifest = readManifest(this.configManifest);
      const currentLockfile = readLockfile(this.configLockfile);
      try {
        const {
          manifest: newManifest,
          lockfile: newLockfile,
        } = await mutateManifest({ manifest: currentManifest, lockfile: currentLockfile }, this.version, install, uninstall, update);
        await this.validateInstall(getItemsList(newLockfile));
        writeManifest(this.configManifest, newManifest);
        writeLockfile(this.configLockfile, newLockfile);
      } catch (e) {
        e.message = `${e.message}${e.message.endsWith('.') ? '' : '.'}\nAll changes were discarded.`;
        error(e);
        await this.validateInstall(getItemsList(currentLockfile));
        throw e;
      }
    } else {
      throw new GameRunningError('Satisfactory is running. Please close it and wait until it fully shuts down.');
    }
  }

  async setConfig(configName: string): Promise<void> {
    const currentConfig = this._config;
    this._config = configName;
    try {
      await this.manifestMutate([], [], []);
    } catch (e) {
      this._config = currentConfig;
      throw new InvalidConfigError(`Error while loading config: ${e.message}`);
    }
  }

  get config(): string {
    return this._config;
  }

  async _installItem(id: string, version?: string): Promise<void> {
    return this.manifestMutate([{ id, version }], [], []);
  }

  async _uninstallItem(item: string): Promise<void> {
    return this.manifestMutate([], [item], []);
  }

  async _updateItem(item: string): Promise<void> {
    return this.manifestMutate([], [], [item]);
  }

  async installMod(modReference: string, version?: string): Promise<void> {
    if (!(await this._getInstalledMods()).some((mod) => mod.mod_reference === modReference)) {
      info(`Installing ${modReference}${version ? `@${version}` : ''}`);
      await this._installItem(modReference, version);
    } else {
      info(`${modReference} is already installed with version ${(await this._getInstalledMods()).find((mod) => mod.mod_reference === modReference)?.version}`);
    }
  }

  async installFicsitAppMod(modVersion: FicsitAppVersion): Promise<void> {
    return this.installMod(await getModReferenceFromId(modVersion.mod_id));
  }

  async uninstallMod(modID: string): Promise<void> {
    info(`Uninstalling ${modID}`);
    return this._uninstallItem(modID);
  }

  async uninstallFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.uninstallMod(mod.mod_reference);
  }

  async updateMod(modID: string): Promise<void> {
    info(`Updating ${modID}`);
    await this._updateItem(modID);
  }

  async updateFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.updateMod(mod.mod_reference);
  }

  private async _getInstalledMods(): Promise<Array<MH.Mod>> {
    return MH.getInstalledMods(SH.getModsDir(this.installLocation));
  }

  get mods(): ItemVersionList {
    return filterObject(this._itemsList, (id) => id !== SH.SMLID && id !== BH.BootstrapperID);
  }

  get manifestMods(): string[] {
    return readManifest(this.configManifest).items
      .filter((item) => item.id !== SH.SMLID && item.id !== BH.BootstrapperID)
      .map((item) => item.id);
  }

  async installSML(version?: string): Promise<void> {
    return this._installItem(SH.SMLID, version);
  }

  async uninstallSML(): Promise<void> {
    return this._uninstallItem(SH.SMLID);
  }

  async updateSML(): Promise<void> {
    info('Updating SML to latest version');
    await this._updateItem(SH.SMLID);
  }

  private async _getInstalledSMLVersion(): Promise<string | undefined> {
    return SH.getSMLVersion(this.installLocation);
  }

  get smlVersion(): string | undefined {
    return this._itemsList[SH.SMLID];
  }

  get isSMLInstalledDev(): boolean {
    return readManifest(this.configManifest).items.some((item) => item.id === SH.SMLID);
  }

  async updateBootstrapper(): Promise<void> {
    info('Updating bootstrapper to latest version');
    await this._updateItem(BH.BootstrapperID);
  }

  async clearCache(): Promise<void> {
    if (!await SatisfactoryInstall.isGameRunning()) {
      MH.clearCache();
      deleteFolderRecursive(path.join(this.installLocation, CacheRelativePath));
    } else {
      throw new GameRunningError('Satisfactory is running. Please close it and wait until it fully shuts down.');
    }
  }

  async checkForUpdates(): Promise<Array<ItemUpdate>> {
    const currentManifest = readManifest(this.configManifest);
    const currentLockfile = readLockfile(this.configLockfile);
    const {
      lockfile: newLockfile,
    } = await mutateManifest({ manifest: currentManifest, lockfile: currentLockfile }, this.version, [], [], Object.keys(this._itemsList));
    return Promise.all(Object.entries(newLockfile)
      .filter(([item, { version: newVersion }]) => !!currentLockfile[item] && !eq(currentLockfile[item].version, newVersion))
      .map(async ([item, { version: newVersion }]) => {
        const currentVersion = currentLockfile[item].version;
        if (item === SH.SMLID) {
          const versions = await getAvailableSMLVersions();
          return {
            item, currentVersion, version: newVersion, releases: versions.filter((ver) => validAndGreater(ver.version, currentVersion)),
          } as ItemUpdate;
        } if (item === BH.BootstrapperID) {
          const versions = await getAvailableBootstrapperVersions();
          return {
            item, currentVersion, version: newVersion, releases: versions.filter((ver) => validAndGreater(ver.version, currentVersion)),
          } as ItemUpdate;
        }
        const versions = await getModVersions(item);
        return {
          item, currentVersion, version: newVersion, releases: versions.filter((ver) => validAndGreater(ver.version, currentVersion)),
        } as ItemUpdate;
      }));
  }

  static isGameRunning(): Promise<boolean> {
    return isRunning('FactoryGame-Win64-Shipping.exe'); // TODO: cross platform
  }

  get bootstrapperVersion(): string | undefined {
    return this._itemsList[BH.BootstrapperID];
  }

  private async _getInstalledBootstrapperVersion(): Promise<string | undefined> {
    return BH.getBootstrapperVersion(this.installLocation);
  }

  private get _itemsList(): ItemVersionList {
    return getItemsList(readLockfile(this.configLockfile));
  }

  get binariesDir(): string {
    return path.join(this.installLocation, 'FactoryGame', 'Binaries', 'Win64'); // TODO: other platforms
  }

  get displayName(): string {
    return `${this.name} - CL${this.version}`;
  }

  get modsDir(): string {
    return SH.getModsDir(this.installLocation);
  }

  get configManifest(): string {
    return path.join(getConfigFolderPath(this._config), 'manifest.json');
  }

  get configLockfile(): string {
    return path.join(getConfigFolderPath(this._config), this.lockfileName);
  }

  get lockfileName(): string {
    return `lock-${getInstallHash(this.installLocation)}.json`;
  }
}

export function getConfigs(): Array<{name: string; items: ManifestItem[]}> {
  return dirs(configFolder).sort().map((name) => {
    const manifest = readManifest(path.join(getConfigFolderPath(name), 'manifest.json'));
    return { name, items: manifest.items };
  });
}

export function deleteConfig(name: string): void {
  if (name.toLowerCase() === VANILLA_CONFIG_NAME || name.toLowerCase() === MODDED_CONFIG_NAME || name.toLowerCase() === DEVELOPMENT_CONFIG_NAME) {
    throw new InvalidConfigError(`Cannot delete ${name} config (it is part of the default set of configs)`);
  }
  if (configExists(name)) {
    deleteFolderRecursive(getConfigFolderPath(name));
  }
}

export function createConfig(name: string, copyConfig = 'vanilla'): void {
  if (configExists(name)) {
    throw new InvalidConfigError(`Config ${name} already exists`);
  }
  if (!configExists(copyConfig)) {
    throw new InvalidConfigError(`Config ${copyConfig} does not exist`);
  }
  writeManifest(path.join(getConfigFolderPath(name), 'manifest.json'), readManifest(path.join(getConfigFolderPath(copyConfig), 'manifest.json')));
}

if (!fs.existsSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'manifest.json'))) {
  writeManifest(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'manifest.json'), { items: new Array<ManifestItem>(), manifestVersion: ManifestVersion.Latest });
}

if (!fs.existsSync(path.join(getConfigFolderPath(MODDED_CONFIG_NAME), 'manifest.json'))) {
  writeManifest(path.join(getConfigFolderPath(MODDED_CONFIG_NAME), 'manifest.json'), { items: new Array<ManifestItem>(), manifestVersion: ManifestVersion.Latest });
}

if (!fs.existsSync(path.join(getConfigFolderPath(DEVELOPMENT_CONFIG_NAME), 'manifest.json'))) {
  writeManifest(path.join(getConfigFolderPath(DEVELOPMENT_CONFIG_NAME), 'manifest.json'), { items: [{ id: SH.SMLID }], manifestVersion: ManifestVersion.Latest });
}
