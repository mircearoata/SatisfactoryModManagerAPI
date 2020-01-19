import path from 'path';
import { getDataFolders } from 'platform-folders';
import fs from 'fs';
import { compare } from 'semver';
import * as ModHandler from './modHandler';
import * as SMLHandler from './smlHandler';
import {
  FicsitAppVersion, getModLatestVersion, FicsitAppMod, getLatestSMLVersion,
} from './ficsitApp';
import { ManifestHandler } from './manifest';
import { ItemVersionList } from './lockfile';
import { debug, info, error } from './utils';

export class SatisfactoryInstall {
  private manifestHandler: ManifestHandler;
  name: string;
  version: string;
  installLocation: string;
  launchExecutable?: string;

  constructor(name: string, version: string, installLocation: string, launchExecutable?: string) {
    this.installLocation = installLocation;
    this.manifestHandler = new ManifestHandler(installLocation);

    this.name = name;
    this.version = version;
    this.launchExecutable = launchExecutable;
  }

  // TODO: always check that what is installed matches the lockfile

  async manifestMutate(install: ItemVersionList, uninstall: string[]): Promise<void> {
    try {
      await this.manifestHandler.setSatisfactoryVersion(this.version);
      const changes = await this.manifestHandler.mutate(install, uninstall);
      debug(JSON.stringify(changes));
      let modsDir = await SMLHandler.getModsDir(this.installLocation);
      await Promise.all(changes.uninstall.map((id) => {
        if (id !== 'SML') {
          return ModHandler.uninstallMod(id, modsDir);
        }
        return Promise.resolve();
      }));
      if (changes.uninstall.includes('SML')) {
        await SMLHandler.uninstallSML(this.installLocation);
      }
      if ('SML' in changes.install) {
        await SMLHandler.installSML(changes.install['SML'], this.installLocation);
      }
      modsDir = await SMLHandler.getModsDir(this.installLocation);
      await Promise.all(Object.entries(changes.install).map((modInstall) => {
        const modInstallID = modInstall[0];
        const modInstallVersion = modInstall[1];
        if (modInstallID !== 'SML') {
          return ModHandler.installMod(modInstallID, modInstallVersion, modsDir);
        }
        return Promise.resolve();
      }));
    } catch (e) {
      e.message = `${e.message}. All changes were discarded.`;
      error(e.message);
      throw e;
    }
  }

  async installMod(modID: string, version: string): Promise<void> {
    if ((await this.getInstalledMods()).some((mod) => mod.mod_id === modID)) {
      info(`Updating ${modID}@${version}`);
      return this.manifestMutate({ [modID]: version }, [modID]);
    }
    info(`Installing ${modID}@${version}`);
    return this.manifestMutate({ [modID]: version }, []);
  }

  async installFicsitAppMod(modVersion: FicsitAppVersion): Promise<void> {
    return this.installMod(modVersion.mod_id, modVersion.version);
  }

  async uninstallMod(modID: string): Promise<void> {
    info(`Uninstalling ${modID}`);
    return this.manifestMutate({}, [modID]);
  }

  async uninstallFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.uninstallMod(mod.id);
  }

  async updateMod(modID: string): Promise<void> {
    return this.manifestMutate({
      [modID]: (await getModLatestVersion(modID)).version,
    }, [modID]);
  }

  async updateFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.updateMod(mod.id);
  }

  async getInstalledMods(): Promise<Array<ModHandler.Mod>> {
    // TODO: replace with lockfile get
    return ModHandler.getInstalledMods(await SMLHandler.getModsDir(this.installLocation));
  }

  async installSML(version: string): Promise<void> {
    if (await this.getSMLVersion()) {
      return this.manifestMutate({ SML: version }, ['SML']);
    }
    return this.manifestMutate({ SML: version }, []);
  }

  async uninstallSML(): Promise<void> {
    return this.manifestMutate({}, ['SML']);
  }

  async updateSML(): Promise<void> {
    return this.manifestMutate({ SML: (await getLatestSMLVersion()).version }, ['SML']);
  }

  async getSMLVersion(): Promise<string | undefined> {
    // TODO: replace with lockfile get
    return SMLHandler.getSMLVersion(this.installLocation);
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

  async modsDir(): Promise<string> {
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
    const semverCmp = compare(a.version, b.version);
    if (semverCmp === 0) {
      return a.name.localeCompare(b.name);
    }
    return semverCmp;
  });
  return foundInstalls;
}
