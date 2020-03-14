import path from 'path';
import { getDataFolders } from 'platform-folders';
import fs from 'fs';
import { compare, valid, coerce } from 'semver';
import * as MH from './modHandler';
import * as SH from './smlHandler';
import * as BH from './bootstrapperHandler';
import {
  FicsitAppVersion, getModLatestVersion, FicsitAppMod, getLatestSMLVersion, getLatestBootstrapperVersion,
} from './ficsitApp';
import { ManifestHandler, Manifest } from './manifest';
import { ItemVersionList, Lockfile } from './lockfile';
import {
  filterObject, mergeArrays, isRunning, ensureExists, configFolder, dirs, deleteFolderRecursive,
} from './utils';
import {
  debug, info, error, warn,
} from './logging';
import { GameRunningError, InvalidConfigError } from './errors';


export function getConfigFolderPath(configName: string): string {
  const configPath = path.join(configFolder, configName);
  ensureExists(configPath);
  return configPath;
}

const VANILLA_CONFIG_NAME = 'vanilla';
const DEFAULT_MODDED_CONFIG_NAME = 'modded';

const CacheRelativePath = '.cache';

export class SatisfactoryInstall {
  private _manifestHandler: ManifestHandler;
  name: string;
  version: string;
  installLocation: string;
  mainGameAppName: string;

  constructor(name: string, version: string, installLocation: string, mainGameAppName: string) {
    this.installLocation = installLocation;
    this._manifestHandler = new ManifestHandler(installLocation);

    this.name = name;
    this.version = version;
    this.mainGameAppName = mainGameAppName;
  }

  private async _getInstalledMismatches(items: ItemVersionList):
  Promise<{ install: ItemVersionList; uninstall: Array<string>}> {
    const installedSML = SH.getSMLVersion(this.installLocation);
    const installedBootstrapper = BH.getBootstrapperVersion(this.installLocation);
    const installedMods = await MH.getInstalledMods(
      SH.getModsDir(this.installLocation),
    );
    const mismatches: { install: ItemVersionList; uninstall: Array<string>} = {
      install: {},
      uninstall: [],
    };

    if (installedSML !== items[SH.SMLModID]) {
      if (!items[SH.SMLModID] || (installedSML && items[SH.SMLModID])) {
        mismatches.uninstall.push(SH.SMLModID);
      }
      if (items[SH.SMLModID]) {
        mismatches.install[SH.SMLModID] = items[SH.SMLModID];
      }
    }

    if (installedBootstrapper !== items[BH.BootstrapperModID]) {
      if (!items[BH.BootstrapperModID] || (installedBootstrapper && items[BH.BootstrapperModID])) {
        mismatches.uninstall.push(BH.BootstrapperModID);
      }
      if (items[BH.BootstrapperModID]) {
        mismatches.install[BH.BootstrapperModID] = items[BH.BootstrapperModID];
      }
    }

    const allMods = mergeArrays(Object.keys(items)
      .filter((item) => item !== SH.SMLModID && item !== BH.BootstrapperModID),
    installedMods.map((mod) => mod.mod_id));
    allMods.forEach((mod) => {
      const installedModVersion = installedMods
        .find((installedMod) => installedMod.mod_id === mod)?.version;
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
    debug(items);
    const mismatches = await this._getInstalledMismatches(items);
    debug(mismatches);
    const modsDir = SH.getModsDir(this.installLocation);
    await Promise.all(mismatches.uninstall.map((id) => {
      if (id !== SH.SMLModID && id !== BH.BootstrapperModID && id !== SH.KeepSMLInstalledModID) {
        if (modsDir) {
          debug(`Removing ${id} from Satisfactory install`);
          return MH.uninstallMod(id, modsDir);
        }
      }
      return Promise.resolve();
    }));
    if (mismatches.uninstall.includes(SH.SMLModID)) {
      debug('Removing SML from Satisfactory install');
      await SH.uninstallSML(this.installLocation);
    }
    if (mismatches.uninstall.includes(BH.BootstrapperModID)) {
      debug('Removing Bootstrapper from Satisfactory install');
      await BH.uninstallBootstrapper(this.installLocation);
    }
    if (mismatches.install[SH.SMLModID]) {
      debug('Copying SML to Satisfactory install');
      await SH.installSML(mismatches.install[SH.SMLModID], this.installLocation);
    }
    if (mismatches.install[BH.BootstrapperModID]) {
      debug('Copying Bootstrapper to Satisfactory install');
      await BH.installBootstrapper(mismatches.install[BH.BootstrapperModID], this.installLocation);
    }
    await Promise.all(Object.entries(mismatches.install).map((modInstall) => {
      const modInstallID = modInstall[0];
      const modInstallVersion = modInstall[1];
      if (modInstallID !== SH.SMLModID && modInstallID !== BH.BootstrapperModID && modInstallID !== SH.KeepSMLInstalledModID) {
        if (modsDir) {
          debug(`Copying ${modInstallID}@${modInstallVersion} to Satisfactory install`);
          return MH.installMod(modInstallID, modInstallVersion, modsDir);
        }
      }
      return Promise.resolve();
    }));
  }

  async manifestMutate(changes: ItemVersionList): Promise<void> {
    if (!SatisfactoryInstall.isGameRunning()) {
      debug(changes);
      const currentManifest = this._manifestHandler.readManifest();
      const currentLockfile = this._manifestHandler.readLockfile();
      try {
        await this._manifestHandler.setSatisfactoryVersion(this.version);
        await this._manifestHandler.mutate(changes);
        await this.validateInstall();
      } catch (e) {
        e.message = `${e.message}. All changes were discarded.`;
        error(e.message);
        await this._manifestHandler.writeManifest(currentManifest);
        await this._manifestHandler.writeLockfile(currentLockfile);
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
    } catch (e) {
      throw new InvalidConfigError(`Config ${configName} is invalid`);
    }
    try {
      lockfile = JSON.parse(fs.readFileSync(path.join(getConfigFolderPath(configName), 'lock.json'), 'utf8'));
    } catch (e) {
      throw new InvalidConfigError(`Config ${configName} is invalid`);
    }
    this._manifestHandler.writeManifest(manifest);
    this._manifestHandler.writeLockfile(lockfile);
    try {
      await this.validateInstall();
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
    fs.writeFileSync(path.join(getConfigFolderPath(configName), 'manifest.json'), JSON.stringify(this._manifestHandler.readManifest()));
    fs.writeFileSync(path.join(getConfigFolderPath(configName), 'lock.json'), JSON.stringify(this._manifestHandler.readLockfile()));
  }

  async installMod(modID: string, version: string): Promise<void> {
    if ((await this._getInstalledMods()).some((mod) => mod.mod_id === modID)) {
      info(`Updating ${modID}@${version}`);
    } else {
      info(`Installing ${modID}@${version}`);
    }
    return this.manifestMutate({ [modID]: version });
  }

  async installFicsitAppMod(modVersion: FicsitAppVersion): Promise<void> {
    return this.installMod(modVersion.mod_id, modVersion.version);
  }

  async uninstallMod(modID: string): Promise<void> {
    info(`Uninstalling ${modID}`);
    return this.manifestMutate({ [modID]: '' });
  }

  async uninstallFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.uninstallMod(mod.id);
  }

  async updateMod(modID: string): Promise<void> {
    const latestVersion = (await getModLatestVersion(modID)).version;
    info(`Updating ${modID}@${latestVersion} (latest version)`);
    const wasModInManifest = modID in this.mods;
    this.manifestMutate({
      [modID]: latestVersion,
    });
    if (!wasModInManifest) {
      this.manifestMutate({
        [modID]: '',
      });
    }
  }

  async updateFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.updateMod(mod.id);
  }

  private async _getInstalledMods(): Promise<Array<MH.Mod>> {
    return MH.getInstalledMods(SH.getModsDir(this.installLocation));
  }

  get mods(): ItemVersionList {
    return filterObject(this._manifestHandler.getItemsList(), (id) => id !== SH.SMLModID && id !== BH.BootstrapperModID);
  }

  async installSML(): Promise<void> {
    return this.manifestMutate({ [SH.KeepSMLInstalledModID]: '0.0.0' });
  }

  async uninstallSML(): Promise<void> {
    return this.manifestMutate({ [SH.KeepSMLInstalledModID]: '' });
  }

  async updateSML(): Promise<void> {
    const latestVersion = (await getLatestSMLVersion()).version;
    info(`Updating SML@${latestVersion} (latest version)`);
    const wasSMLInManifest = this.smlVersion !== undefined;
    this.manifestMutate({ [SH.SMLModID]: latestVersion });
    if (!wasSMLInManifest) {
      this.manifestMutate({
        [SH.SMLModID]: '',
      });
    }
  }

  private async _getInstalledSMLVersion(): Promise<string | undefined> {
    return SH.getSMLVersion(this.installLocation);
  }

  get smlVersion(): string | undefined {
    return this._manifestHandler.getItemsList()[SH.SMLModID];
  }

  async updateBootstrapper(): Promise<void> {
    const latestVersion = (await getLatestBootstrapperVersion()).version;
    info(`Updating bootstrapper@${latestVersion} (latest version)`);
    const wasBootstrapperInManifest = this.bootstrapperVersion !== undefined;
    this.manifestMutate({ [BH.BootstrapperModID]: latestVersion });
    if (!wasBootstrapperInManifest) {
      this.manifestMutate({
        [BH.BootstrapperModID]: '',
      });
    }
  }

  clearCache(): void {
    if (!SatisfactoryInstall.isGameRunning()) {
      deleteFolderRecursive(path.join(this.installLocation, CacheRelativePath));
    } else {
      throw new GameRunningError('Satisfactory is running. Please close it and wait until it fully shuts down.');
    }
  }

  static isGameRunning(): boolean {
    return isRunning('FactoryGame-Win64'); // tasklist trims the name // TODO: cross platform
  }

  get bootstrapperVersion(): string | undefined {
    return this._manifestHandler.getItemsList()[BH.BootstrapperModID];
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
  return dirs(configFolder);
}

if (!fs.existsSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'manifest.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'manifest.json'), JSON.stringify({}));
}
if (!fs.existsSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'lock.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(VANILLA_CONFIG_NAME), 'lock.json'), JSON.stringify({}));
}

if (!fs.existsSync(path.join(getConfigFolderPath(DEFAULT_MODDED_CONFIG_NAME), 'manifest.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(DEFAULT_MODDED_CONFIG_NAME), 'manifest.json'), JSON.stringify({}));
}
if (!fs.existsSync(path.join(getConfigFolderPath(DEFAULT_MODDED_CONFIG_NAME), 'lock.json'))) {
  fs.writeFileSync(path.join(getConfigFolderPath(DEFAULT_MODDED_CONFIG_NAME), 'lock.json'), JSON.stringify({}));
}

const EpicManifestsFolder = path.join(getDataFolders()[0], 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'); // TODO: other platforms

export async function getInstalls(): Promise<Array<SatisfactoryInstall>> {
  const foundInstalls = new Array<SatisfactoryInstall>();
  fs.readdirSync(EpicManifestsFolder).forEach((fileName) => {
    if (fileName.endsWith('.item')) {
      const filePath = path.join(EpicManifestsFolder, fileName);
      try {
        const jsonString = fs.readFileSync(filePath, 'utf8');
        const manifest = JSON.parse(jsonString);
        if (manifest.CatalogNamespace === 'crab') {
          const gameManifestString = fs.readFileSync(path.join(manifest.ManifestLocation, `${manifest.InstallationGuid}.mancpn`), 'utf8');
          const gameManifest = JSON.parse(gameManifestString);
          if (gameManifest.AppName === manifest.MainGameAppName
            && gameManifest.CatalogItemId === manifest.CatalogItemId
            && gameManifest.CatalogNamespace === manifest.CatalogNamespace) {
            foundInstalls.push(new SatisfactoryInstall(
              manifest.DisplayName,
              manifest.AppVersionString,
              manifest.InstallLocation,
              manifest.MainGameAppName,
            ));
          }
        }
      } catch (e) {
        info(`Found invalid manifest: ${fileName}`);
      }
    }
  });
  foundInstalls.sort((a, b) => {
    const semverCmp = compare(valid(coerce(a.version)) || '0.0.0', valid(coerce(b.version)) || '0.0.0');
    if (semverCmp === 0) {
      return a.name.localeCompare(b.name);
    }
    return semverCmp;
  });
  if (foundInstalls.length === 0) {
    warn('No Satisfactory installs found');
  }
  return foundInstalls;
}
