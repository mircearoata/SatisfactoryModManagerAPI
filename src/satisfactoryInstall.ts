import path from 'path';
import { getDataFolders } from 'platform-folders';
import fs from 'fs';
import { compare, valid, coerce } from 'semver';
import { createHash } from 'crypto';
import * as MH from './modHandler';
import * as SH from './smlHandler';
import * as BH from './bootstrapperHandler';
import {
  FicsitAppVersion, FicsitAppMod, getModReferenceFromId,
} from './ficsitApp';
import { ManifestHandler, Manifest, ManifestItem } from './manifest';
import { ItemVersionList, Lockfile } from './lockfile';
import {
  filterObject, mergeArrays, isRunning, ensureExists, configFolder, dirs, deleteFolderRecursive, manifestsDir,
} from './utils';
import {
  debug, info, error, warn,
} from './logging';
import {
  GameRunningError, InvalidConfigError,
} from './errors';

export function getConfigFolderPath(configName: string): string {
  const configPath = path.join(configFolder, configName);
  ensureExists(configPath);
  return configPath;
}

const VANILLA_CONFIG_NAME = 'vanilla';
const MODDED_CONFIG_NAME = 'modded';
const DEVELOPMENT_CONFIG_NAME = 'development';

const CacheRelativePath = '.cache';

export function getInstallHash(satisfactoryPath: string): string {
  return createHash('sha256').update(satisfactoryPath, 'utf8').digest('hex');
}

export function getManifestFolderPath(satisfactoryPath: string): string {
  return path.join(manifestsDir, getInstallHash(satisfactoryPath));
}

export class SatisfactoryInstall {
  private _manifestHandler: ManifestHandler;
  name: string;
  version: string;
  installLocation: string;
  mainGameAppName: string;

  constructor(name: string, version: string, installLocation: string, mainGameAppName: string) {
    this.installLocation = installLocation;
    this._manifestHandler = new ManifestHandler(getManifestFolderPath(installLocation));

    this.name = name;
    this.version = version;
    this.mainGameAppName = mainGameAppName;
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

  async validateInstall(): Promise<void> {
    const items = this._manifestHandler.getItemsList();
    debug(`Items: ${JSON.stringify(items)}`);
    const mismatches = await this._getInstalledMismatches(items);
    debug(`Mismatches: ${JSON.stringify(mismatches)}`);
    const modsDir = SH.getModsDir(this.installLocation);
    await Promise.all(mismatches.uninstall.map((id) => {
      if (id !== SH.SMLID && id !== BH.BootstrapperID) {
        if (modsDir) {
          debug(`Removing ${id} from Satisfactory install`);
          return MH.uninstallMod(id, modsDir);
        }
      }
      return Promise.resolve();
    }));
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
    if (!await SatisfactoryInstall.isGameRunning()) {
      debug(`install: [${install.map((item) => (item.version ? `${item.id}@${item.version}` : item.id)).join(', ')}], uninstall: [${uninstall.join(', ')}], update: [${update.join(', ')}]`);
      const currentManifest = this._manifestHandler.readManifest();
      const currentLockfile = this._manifestHandler.readLockfile();
      try {
        await this._manifestHandler.setSatisfactoryVersion(this.version);
        await this._manifestHandler.mutate(install, uninstall, update);
        await this.validateInstall();
      } catch (e) {
        await this._manifestHandler.writeManifest(currentManifest);
        await this._manifestHandler.writeLockfile(currentLockfile);
        e.message = `${e.message}\nAll changes were discarded.`;
        error(e);
        await this.validateInstall();
        throw e;
      }
    } else {
      throw new GameRunningError('Satisfactory is running. Please close it and wait until it fully shuts down.');
    }
  }

  async loadConfig(configName: string): Promise<void> {
    const currentManifest = this._manifestHandler.readManifest();
    const currentLockfile = this._manifestHandler.readLockfile();
    let manifest: Manifest;
    let lockfile: Lockfile;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(getConfigFolderPath(configName), 'manifest.json'), 'utf8'));
      manifest.satisfactoryVersion = this.version;
    } catch (e) {
      throw new InvalidConfigError(`Config ${configName} is invalid`);
    }
    if (fs.existsSync(path.join(getConfigFolderPath(configName), `lock-${getInstallHash(this.installLocation)}.json`))) {
      try {
        lockfile = JSON.parse(fs.readFileSync(path.join(getConfigFolderPath(configName), `lock-${getInstallHash(this.installLocation)}.json`), 'utf8'));
      } catch (e) {
        throw new InvalidConfigError(`Config ${configName} is invalid`);
      }
    } else {
      lockfile = {};
    }
    this._manifestHandler.writeManifest(manifest);
    this._manifestHandler.writeLockfile(lockfile);
    try {
      await this.manifestMutate([], [], []);
    } catch (e) {
      // Something invalid was found. Revert and pass the error forward
      this._manifestHandler.writeManifest(currentManifest);
      this._manifestHandler.writeLockfile(currentLockfile);
      await this.validateInstall();
      throw new InvalidConfigError(`Error while loading config: ${e}`);
    }
  }

  async saveConfig(configName: string): Promise<void> {
    if (configName.toLowerCase() === VANILLA_CONFIG_NAME) {
      throw new InvalidConfigError('Cannot modify vanilla config. Use Modded config or create a new config');
    }
    const manifest = this._manifestHandler.readManifest();
    delete manifest.satisfactoryVersion;
    fs.writeFileSync(path.join(getConfigFolderPath(configName), 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(getConfigFolderPath(configName), `lock-${getInstallHash(this.installLocation)}.json`), JSON.stringify(this._manifestHandler.readLockfile()));
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
    return filterObject(this._manifestHandler.getItemsList(), (id) => id !== SH.SMLID && id !== BH.BootstrapperID);
  }

  get manifestMods(): string[] {
    return this._manifestHandler.readManifest().items
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
    return this._manifestHandler.getItemsList()[SH.SMLID];
  }

  get isSMLInstalledDev(): boolean {
    return this._manifestHandler.readManifest().items.some((item) => item.id === SH.SMLID);
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

  static isGameRunning(): Promise<boolean> {
    return isRunning('FactoryGame-Win64-Shipping.exe'); // TODO: cross platform
  }

  get bootstrapperVersion(): string | undefined {
    return this._manifestHandler.getItemsList()[BH.BootstrapperID];
  }

  private async _getInstalledBootstrapperVersion(): Promise<string | undefined> {
    return BH.getBootstrapperVersion(this.installLocation);
  }

  get launchPath(): string | undefined {
    return `com.epicgames.launcher://apps/${this.mainGameAppName}?action=launch&silent=true`;
  }

  get binariesDir(): string {
    return path.join(this.installLocation, 'FactoryGame', 'Binaries', 'Win64'); // TODO: other platforms
  }

  get displayName(): string {
    return `${this.name} (${this.version})`;
  }

  get modsDir(): string {
    return SH.getModsDir(this.installLocation);
  }
}

export function getConfigs(): Array<string> {
  return dirs(configFolder).sort();
}

export function deleteConfig(name: string): void {
  if (name.toLowerCase() === VANILLA_CONFIG_NAME || name.toLowerCase() === MODDED_CONFIG_NAME || name.toLowerCase() === DEVELOPMENT_CONFIG_NAME) {
    throw new InvalidConfigError(`Cannot delete ${name} config (it is part of the default set of configs)`);
  }
  if (fs.existsSync(getConfigFolderPath(name))) {
    deleteFolderRecursive(getConfigFolderPath(name));
  }
}

if (!fs.existsSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'manifest.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'manifest.json'), JSON.stringify({ items: new Array<ManifestItem>() } as Manifest));
}
if (!fs.existsSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'lock.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'lock.json'), JSON.stringify({} as Lockfile));
}

if (!fs.existsSync(path.join(getConfigFolderPath(MODDED_CONFIG_NAME), 'manifest.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(MODDED_CONFIG_NAME), 'manifest.json'), JSON.stringify({ items: new Array<ManifestItem>() } as Manifest));
}
if (!fs.existsSync(path.join(getConfigFolderPath(MODDED_CONFIG_NAME), 'lock.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(MODDED_CONFIG_NAME), 'lock.json'), JSON.stringify({} as Lockfile));
}

if (!fs.existsSync(path.join(getConfigFolderPath(DEVELOPMENT_CONFIG_NAME), 'manifest.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(DEVELOPMENT_CONFIG_NAME), 'manifest.json'), JSON.stringify({ items: [{ id: SH.SMLID }] } as Manifest));
}
if (!fs.existsSync(path.join(getConfigFolderPath(DEVELOPMENT_CONFIG_NAME), 'lock.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(DEVELOPMENT_CONFIG_NAME), 'lock.json'), JSON.stringify({} as Lockfile));
}

const EpicManifestsFolder = path.join(getDataFolders()[0], 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'); // TODO: other platforms
const UEInstalledManifest = path.join(getDataFolders()[0], 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'); // TODO: other platforms

interface UEInstalledManifestEntry {
  InstallLocation: string;
  AppName: string;
  AppVersion: string;
}

interface UEInstalledManifest {
  InstallationList: Array<UEInstalledManifestEntry>;
}

export async function getInstalls(): Promise<Array<SatisfactoryInstall>> {
  let foundInstalls = new Array<SatisfactoryInstall>();
  if (fs.existsSync(EpicManifestsFolder)) {
    fs.readdirSync(EpicManifestsFolder).forEach((fileName) => {
      if (fileName.endsWith('.item')) {
        const filePath = path.join(EpicManifestsFolder, fileName);
        try {
          const jsonString = fs.readFileSync(filePath, 'utf8');
          const manifest = JSON.parse(jsonString);
          if (manifest.CatalogNamespace === 'crab') {
            try {
              const gameManifestString = fs.readFileSync(path.join(manifest.ManifestLocation, `${manifest.InstallationGuid}.mancpn`), 'utf8');
              const gameManifest = JSON.parse(gameManifestString);
              if (gameManifest.AppName === manifest.MainGameAppName
              && gameManifest.CatalogItemId === manifest.CatalogItemId
              && gameManifest.CatalogNamespace === manifest.CatalogNamespace) {
                const installWithSamePath = foundInstalls.find((install) => install.installLocation === manifest.InstallLocation);
                if (installWithSamePath) {
                  if (parseInt(manifest.AppVersionString, 10) > parseInt(installWithSamePath.version, 10)) {
                    installWithSamePath.version = manifest.AppVersionString;
                  }
                } else {
                  foundInstalls.push(new SatisfactoryInstall(
                    manifest.DisplayName,
                    manifest.AppVersionString,
                    manifest.InstallLocation,
                    manifest.MainGameAppName,
                  ));
                }
              } else {
                warn(`Epic install info points to invalid folder ${manifest.InstallLocation}. If you moved your install to an external drive, try verifying the game in Epic and restarting your PC.`);
              }
            } catch (e) {
              warn(`Epic install info points to invalid folder ${manifest.InstallLocation}. If you moved your install to an external drive, try verifying the game in Epic and restarting your PC.`);
            }
          }
        } catch (e) {
          info(`Found invalid manifest: ${fileName}`);
        }
      }
    });
  }
  if (foundInstalls.length === 0) {
    warn('No Satisfactory installs found');
  }
  let installedManifest: UEInstalledManifest = { InstallationList: [] };
  if (fs.existsSync(UEInstalledManifest)) {
    try {
      installedManifest = JSON.parse(fs.readFileSync(UEInstalledManifest, 'utf8'));
      foundInstalls = foundInstalls.filter((install) => installedManifest.InstallationList.some(
        (manifestInstall) => manifestInstall.InstallLocation === install.installLocation,
      )); // Filter out old .items left over by Epic
      if (foundInstalls.length === 0) {
        warn('UE manifest filtered all installs.');
      }
    } catch (e) {
      info('Invalid UE manifest. The game might appear multiple times.');
    }
  } else {
    info('Invalid UE manifest. The game might appear multiple times.');
  }
  foundInstalls.sort((a, b) => {
    const semverCmp = compare(valid(coerce(a.version)) || '0.0.0', valid(coerce(b.version)) || '0.0.0');
    if (semverCmp === 0) {
      return a.name.localeCompare(b.name);
    }
    return semverCmp;
  });
  return foundInstalls;
}
