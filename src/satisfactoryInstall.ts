import path from 'path';
import { getDataFolders } from 'platform-folders';
import fs from 'fs';
import { compare, valid, coerce } from 'semver';
import * as ModHandler from './modHandler';
import * as SMLHandler from './smlHandler';
import {
  FicsitAppVersion, getModLatestVersion, FicsitAppMod, getLatestSMLVersion,
} from './ficsitApp';
import { ManifestHandler } from './manifest';
import { ItemVersionList } from './lockfile';
import {
  debug, info, error, filterObject, mergeArrays,
} from './utils';

export class SatisfactoryInstall {
  private _manifestHandler: ManifestHandler;
  name: string;
  version: string;
  installLocation: string;
  launchExecutable?: string;

  constructor(name: string, version: string, installLocation: string, launchExecutable?: string) {
    this.installLocation = installLocation;
    this._manifestHandler = new ManifestHandler(installLocation);

    this.name = name;
    this.version = version;
    this.launchExecutable = launchExecutable;
  }

  private async _getInstalledMismatches(items: ItemVersionList):
  Promise<{ install: ItemVersionList; uninstall: Array<string>}> {
    const installedSML = SMLHandler.getSMLVersion(this.installLocation);
    const installedMods = await ModHandler.getInstalledMods(
      SMLHandler.getModsDir(this.installLocation),
    );
    const mismatches: { install: ItemVersionList; uninstall: Array<string>} = {
      install: {},
      uninstall: [],
    };

    if (installedSML !== items['SML']) {
      if (!items['SML'] || (installedSML && items['SML'])) {
        mismatches.uninstall.push('SML');
      }
      mismatches.install['SML'] = items['SML'];
    }

    const allMods = mergeArrays(Object.keys(items).filter((item) => item !== 'SML'), installedMods.map((mod) => mod.mod_id));
    allMods.forEach((mod) => {
      const installedModVersion = installedMods
        .find((installedMod) => installedMod.mod_id === mod)?.version;
      if (installedModVersion !== items[mod]) {
        if (!items[mod] || (installedModVersion && items[mod])) {
          mismatches.uninstall.push(mod);
        }
        mismatches.install[mod] = items[mod];
      }
    });

    return mismatches;
  }

  async validateInstall(): Promise<void> {
    const items = this._manifestHandler.getItemsList();
    debug(JSON.stringify(items));
    const mismatches = await this._getInstalledMismatches(items);
    debug(JSON.stringify(mismatches));
    const modsDir = SMLHandler.getModsDir(this.installLocation);
    await Promise.all(mismatches.uninstall.map((id) => {
      if (id !== 'SML') {
        if (modsDir) {
          return ModHandler.uninstallMod(id, modsDir);
        }
      }
      return Promise.resolve();
    }));
    if (mismatches.uninstall.includes('SML')) {
      await SMLHandler.uninstallSML(this.installLocation);
    }
    if (mismatches.install['SML']) {
      await SMLHandler.installSML(mismatches.install['SML'], this.installLocation);
    }
    await Promise.all(Object.entries(mismatches.install).map((modInstall) => {
      const modInstallID = modInstall[0];
      const modInstallVersion = modInstall[1];
      if (modInstallID !== 'SML') {
        if (modsDir) {
          return ModHandler.installMod(modInstallID, modInstallVersion, modsDir);
        }
      }
      return Promise.resolve();
    }));
  }

  async manifestMutate(changes: ItemVersionList): Promise<void> {
    try {
      await this._manifestHandler.setSatisfactoryVersion(this.version);
      await this._manifestHandler.mutate(changes);
      await this.validateInstall();
    } catch (e) {
      e.message = `${e.message}. All changes were discarded.`;
      error(e.message);
      throw e;
    }
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
    return this.manifestMutate({
      [modID]: latestVersion,
    });
  }

  async updateFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.updateMod(mod.id);
  }

  private async _getInstalledMods(): Promise<Array<ModHandler.Mod>> {
    return ModHandler.getInstalledMods(SMLHandler.getModsDir(this.installLocation));
  }

  get mods(): ItemVersionList {
    return filterObject(this._manifestHandler.getItemsList(), (id) => id !== 'SML');
  }

  async installSML(version: string): Promise<void> {
    return this.manifestMutate({ SML: version });
  }

  async uninstallSML(): Promise<void> {
    return this.manifestMutate({ SML: '' });
  }

  async updateSML(): Promise<void> {
    return this.manifestMutate({ SML: (await getLatestSMLVersion()).version });
  }

  private async _getInstalledSMLVersion(): Promise<string | undefined> {
    return SMLHandler.getSMLVersion(this.installLocation);
  }

  get smlVersion(): string | undefined {
    return this._manifestHandler.getItemsList()['SML'];
  }

  get launchPath(): string | undefined {
    if (!this.launchExecutable) {
      return undefined;
    }
    return path.join(this.installLocation, this.launchExecutable);
  }

  get binariesDir(): string {
    return path.join(this.installLocation, 'FactoryGame', 'Binaries', 'Win64');
  }

  get displayName(): string {
    return `${this.name} (${this.version})`;
  }

  async modsDir(): Promise<string | undefined> {
    return SMLHandler.getModsDir(this.installLocation);
  }
}

const EpicManifestsFolder = path.join(getDataFolders()[0], 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');

export async function getInstalls(): Promise<Array<SatisfactoryInstall>> {
  const foundInstalls = new Array<SatisfactoryInstall>();
  fs.readdirSync(EpicManifestsFolder).forEach((fileName) => {
    if (fileName.endsWith('.item')) {
      const filePath = path.join(EpicManifestsFolder, fileName);
      const jsonString = fs.readFileSync(filePath, 'utf8');
      const manifest = JSON.parse(jsonString);
      if (manifest.CatalogNamespace === 'crab') {
        foundInstalls.push(new SatisfactoryInstall(
          manifest.DisplayName,
          manifest.AppVersionString,
          manifest.InstallLocation,
          manifest.LaunchExecutable,
        ));
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
  return foundInstalls;
}
