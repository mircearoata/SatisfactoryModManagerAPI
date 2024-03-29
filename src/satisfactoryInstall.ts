import path from 'path';
import fs from 'fs';
import { eq } from 'semver';
import JSZip from 'jszip';
import { getCachedMods, markModInUse } from './mods/modCache';
import * as MH from './mods/modHandler';
import * as SH from './sml/smlHandler';
import * as BH from './bootstrapper/bootstrapperHandler';
import {
  getModVersions, getAvailableSMLVersions, getAvailableBootstrapperVersions,
} from './dataProviders';
import {
  refetchVersions,
} from './dataProviders/ficsitApp';
import {
  FicsitAppVersion, FicsitAppSMLVersion, FicsitAppBootstrapperVersion,
} from './dataProviders/types';
import {
  ManifestItem, mutateManifest, readManifest, writeManifest, Manifest,
} from './manifest';
import {
  computeLockfile, getItemsList, ItemVersionList, Lockfile, readLockfile, writeLockfile,
} from './lockfile';
import {
  filterObject, mergeArrays, isRunning, deleteFolderRecursive, validAndGreater, hashString, SMLID, BootstrapperID,
} from './utils';
import {
  debug, info, error, warn,
} from './logging';
import {
  GameRunningError, InvalidProfileError,
} from './errors';
import { ensureExists } from './paths';
import { Mod } from './mods/mod';
import {
  getProfileFolderPath, profileExists, ProfileMetadata, VANILLA_PROFILE_NAME, MODDED_PROFILE_NAME,
} from './profile';
import { markSMLInUse } from './sml/smlCache';
import { markBootstrapperInUse } from './bootstrapper/bootstrapperCache';

export interface ItemUpdate {
  item: string;
  currentVersion: string;
  version: string;
  releases: Array<FicsitAppVersion | FicsitAppSMLVersion | FicsitAppBootstrapperVersion>;
}

export class SatisfactoryInstall {
  name: string;
  version: string;
  branch: string;
  installLocation: string;
  launchPath?: string;
  setup?: () => Promise<void>;

  private _profile = MODDED_PROFILE_NAME;

  constructor(name: string, version: string, branch: string, installLocation: string, launchPath?: string, setup?: () => Promise<void>) {
    this.name = name;
    this.version = version;
    this.branch = branch;
    this.installLocation = installLocation;
    this.launchPath = launchPath;
    this.setup = setup;
  }

  private async _getInstalledMismatches(items: ItemVersionList):
  Promise<{ install: ItemVersionList; uninstall: Array<string>}> {
    const installedSML = SH.getSMLVersion(this.installLocation);
    const installedBootstrapper = BH.getBootstrapperVersion(this.installLocation);
    const installedMods = await MH.getInstalledMods(SH.getModsDir(this.installLocation), SH.getSMLVersionEnum(this.installLocation));
    const mismatches: { install: ItemVersionList; uninstall: Array<string>} = {
      install: {},
      uninstall: [],
    };

    if (installedSML !== items[SMLID]) {
      if (!items[SMLID] || (installedSML && items[SMLID])) {
        mismatches.uninstall.push(SMLID);
      }
      if (items[SMLID]) {
        mismatches.install[SMLID] = items[SMLID];
      }
    }

    if (installedBootstrapper !== items[BootstrapperID]) {
      if (!items[BootstrapperID] || (installedBootstrapper && items[BootstrapperID])) {
        mismatches.uninstall.push(BootstrapperID);
      }
      if (items[BootstrapperID]) {
        mismatches.install[BootstrapperID] = items[BootstrapperID];
      }
    }

    const allMods = mergeArrays(Object.keys(items)
      .filter((item) => item !== SMLID && item !== BootstrapperID),
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
    let modsDir = SH.getModsDir(this.installLocation);
    mismatches.uninstall.forEach((id) => debug(`Removing ${id} from Satisfactory install`));
    await MH.uninstallMods(mismatches.uninstall, modsDir, SH.getSMLVersionEnum(this.installLocation));
    if (mismatches.uninstall.includes(SMLID)) {
      debug('Removing SML from Satisfactory install');
      await SH.uninstallSML(this.installLocation);
    }
    if (mismatches.uninstall.includes(BootstrapperID)) {
      debug('Removing Bootstrapper from Satisfactory install');
      await BH.uninstallBootstrapper(this.installLocation);
    }
    if (mismatches.install[SMLID]) {
      debug('Copying SML to Satisfactory install');
      await SH.installSML(mismatches.install[SMLID], this.installLocation);
    }
    if (mismatches.install[BootstrapperID]) {
      debug('Copying Bootstrapper to Satisfactory install');
      await BH.installBootstrapper(mismatches.install[BootstrapperID], this.installLocation);
    }
    if (Object.entries(mismatches.install).length > 0) {
      await getCachedMods(); // Make sure the cache is loaded
    }
    modsDir = SH.getModsDir(this.installLocation);
    const smlVersionEnum = SH.getSMLVersionEnum(this.installLocation);
    await Promise.all(Object.entries(mismatches.install).map(async (modInstall) => {
      const modInstallID = modInstall[0];
      const modInstallVersion = modInstall[1];
      if (modInstallID !== SMLID && modInstallID !== BootstrapperID) {
        if (modsDir) {
          debug(`Copying ${modInstallID}@${modInstallVersion} to Satisfactory install`);
          await MH.installMod(modInstallID, modInstallVersion, modsDir, smlVersionEnum);
        }
      }
    }));
  }

  async manifestMutate(install: Array<ManifestItem>, uninstall: Array<string>,
    enable: Array<string>, disable: Array<string>,
    update: Array<string>): Promise<void> {
    if (this._profile === VANILLA_PROFILE_NAME && (install.length > 0 || update.length > 0)) {
      throw new InvalidProfileError('Cannot modify vanilla profile. Use "modded" profile or create a new profile');
    }
    if (!await SatisfactoryInstall.isGameRunning()) {
      debug(`install: [${install.map((item) => (item.version ? `${item.id}@${item.version}` : item.id)).join(', ')}], uninstall: [${uninstall.join(', ')}], enable: [${enable.join(', ')}], disable: [${disable.join(', ')}], update: [${update.join(', ')}]`);
      const currentManifest = this.readManifest();
      const currentLockfile = this.readLockfile();
      try {
        const newManifest = await mutateManifest(currentManifest, install, uninstall, enable, disable, update);
        try {
          const newLockfile = await computeLockfile(newManifest, currentLockfile, this.version, update);
          await this.validateInstall(getItemsList(newLockfile));
          writeManifest(this.profileManifest, newManifest);
          writeLockfile(this.profileLockfile, newLockfile);
        } catch (e) {
          if (install.length === 0 && update.length === 0 && enable.length === 0) {
            writeManifest(this.profileManifest, newManifest); // save manifest when only uninstalling mods, so that other erroring can be uninstalled too
          }
          throw e;
        }
      } catch (e) {
        error(e);
        await this.validateInstall(getItemsList(currentLockfile));
        throw e;
      }
      this.markCacheFilesInUse();
    } else {
      throw new GameRunningError('Satisfactory is running. Please close it and wait until it fully shuts down.');
    }
  }

  async markCacheFilesInUse(): Promise<void> {
    const modsDir = SH.getModsDir(this.installLocation);
    const installedMods = await MH.getInstalledMods(modsDir, SH.getSMLVersionEnum(this.installLocation));
    installedMods.forEach((mod) => {
      markModInUse(mod.mod_reference, mod.version);
    });
    if (this.smlVersion) {
      markSMLInUse(this.smlVersion);
    }
    if (this.bootstrapperVersion) {
      markBootstrapperInUse(this.bootstrapperVersion);
    }
  }

  async setProfile(profileName: string): Promise<void> {
    const currentProfile = this._profile;
    this._profile = profileName;
    try {
      debug(`Setting profile to ${profileName}`);
      await this.manifestMutate([], [], [], [], []);
    } catch (e) {
      this._profile = currentProfile;
      throw new InvalidProfileError(`Error while loading profile: ${e.message}`);
    }
  }

  get profile(): string {
    return this._profile;
  }

  async _installItem(id: string, version?: string): Promise<void> {
    return this.manifestMutate([{ id, version, enabled: true }], [], [], [], []);
  }

  async _uninstallItem(item: string): Promise<void> {
    return this.manifestMutate([], [item], [], [], []);
  }

  async _enableItem(item: string): Promise<void> {
    return this.manifestMutate([], [], [item], [], []);
  }

  async _disableItem(item: string): Promise<void> {
    return this.manifestMutate([], [], [], [item], []);
  }

  async _updateItem(item: string): Promise<void> {
    return this.manifestMutate([], [], [], [], [item]);
  }

  async installMod(modReference: string, version?: string): Promise<void> {
    info(`Installing ${modReference}${version ? `@${version}` : ''}`);
    await this._installItem(modReference, version);
  }

  async uninstallMod(modReference: string): Promise<void> {
    info(`Uninstalling ${modReference}`);
    return this._uninstallItem(modReference);
  }

  async enableMod(modReference: string): Promise<void> {
    info(`Enabling ${modReference}`);
    await this._enableItem(modReference);
  }

  async disableMod(modReference: string): Promise<void> {
    info(`Disabling ${modReference}`);
    return this._disableItem(modReference);
  }

  async updateMod(modReference: string): Promise<void> {
    info(`Updating ${modReference}`);
    await this._updateItem(modReference);
  }

  private async _getInstalledMods(): Promise<Array<Mod>> {
    return MH.getInstalledMods(SH.getModsDir(this.installLocation), SH.getSMLVersionEnum(this.installLocation));
  }

  get mods(): ItemVersionList {
    return filterObject(this._itemsList, (id) => id !== SMLID && id !== BootstrapperID);
  }

  get manifestMods(): ManifestItem[] {
    return this.readManifest().items
      .filter((item) => item.id !== SMLID && item.id !== BootstrapperID);
  }

  async installSML(version?: string): Promise<void> {
    return this._installItem(SMLID, version);
  }

  async uninstallSML(): Promise<void> {
    return this._uninstallItem(SMLID);
  }

  async updateSML(): Promise<void> {
    info('Updating SML to latest version');
    await this._updateItem(SMLID);
  }

  private async _getInstalledSMLVersion(): Promise<string | undefined> {
    return SH.getSMLVersion(this.installLocation);
  }

  get smlVersion(): string | undefined {
    return this._itemsList[SMLID];
  }

  get manifestSML(): ManifestItem | undefined {
    return this.readManifest().items.find((item) => item.id === SMLID);
  }

  async updateBootstrapper(): Promise<void> {
    info('Updating bootstrapper to latest version');
    await this._updateItem(BootstrapperID);
  }

  async checkForUpdates(): Promise<Array<ItemUpdate>> {
    const currentManifest = this.readManifest();
    const currentLockfile = this.readLockfile();
    await refetchVersions();
    const newLockfile = await computeLockfile(currentManifest, currentLockfile, this.version, Object.keys(this._itemsList));
    return Promise.all(Object.entries(newLockfile)
      .filter(([item, { version: newVersion }]) => !!currentLockfile[item] && !eq(currentLockfile[item].version, newVersion))
      .map(async ([item, { version: newVersion }]) => {
        const currentVersion = currentLockfile[item].version;
        if (item === SMLID) {
          const versions = await getAvailableSMLVersions();
          return {
            item, currentVersion, version: newVersion, releases: versions.filter((ver) => validAndGreater(ver.version, currentVersion)),
          } as ItemUpdate;
        } if (item === BootstrapperID) {
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

  async importProfile(filePath: string, profileName: string, includeVersions = false): Promise<void> {
    if (profileExists(profileName)) {
      throw new InvalidProfileError(`Profile ${profileName} already exists. Delete it, or choose another name for the profile`);
    }
    ensureExists(getProfileFolderPath(profileName));

    let lockfile: Lockfile;
    let manifest: Manifest;
    let metadata: ProfileMetadata;

    try {
      const profileFile = await JSZip.loadAsync(fs.readFileSync(filePath));
      const lockfileFile = profileFile.file('lockfile.json');
      const manifestFile = profileFile.file('manifest.json');
      const metadataFile = profileFile.file('metadata.json');
      if (!lockfileFile || !manifestFile || !metadataFile) {
        throw new Error('Profile file is invalid');
      }
      lockfile = JSON.parse(await lockfileFile.async('text')) as Lockfile;
      manifest = JSON.parse(await manifestFile.async('text')) as Manifest;
      metadata = JSON.parse(await metadataFile.async('text')) as ProfileMetadata;
    } catch (e) {
      throw new Error('Error while reading profile');
    }
    if (validAndGreater(metadata.gameVersion, this.version)) {
      warn(`The profile you're importing is made for game version ${metadata.gameVersion}, but you're using ${this.version}. Things might not work as expected. ${includeVersions ? 'Including versions.' : 'No versions.'}`);
    }

    writeManifest(path.join(getProfileFolderPath(profileName), 'manifest.json'), manifest);
    if (includeVersions) {
      writeLockfile(path.join(getProfileFolderPath(profileName), this.lockfileName), lockfile);
    }

    try {
      await this.setProfile(profileName);
    } catch (e) {
      deleteFolderRecursive(getProfileFolderPath(profileName));
      throw e;
    }
  }

  async exportProfile(filePath: string): Promise<void> {
    const manifest = this.readManifest();
    const lockfile = this.readLockfile();
    const metadata = { gameVersion: this.version } as ProfileMetadata;

    const profileFile = new JSZip();
    profileFile.file('manifest.json', JSON.stringify(manifest));
    profileFile.file('lockfile.json', JSON.stringify(lockfile));
    profileFile.file('metadata.json', JSON.stringify(metadata));

    return new Promise((resolve, reject) => {
      profileFile.generateNodeStream().pipe(fs.createWriteStream(filePath)).on('finish', resolve).on('error', reject);
    });
  }

  static async isGameRunning(): Promise<boolean> {
    return (await Promise.all([isRunning('FactoryGame-Win64-Shipping.exe'), await isRunning('UE4-Win64-Shipping.exe')])).some((running) => running);
  }

  get bootstrapperVersion(): string | undefined {
    return this._itemsList[BootstrapperID];
  }

  private async _getInstalledBootstrapperVersion(): Promise<string | undefined> {
    return BH.getBootstrapperVersion(this.installLocation);
  }

  private get _itemsList(): ItemVersionList {
    return getItemsList(this.readLockfile());
  }

  get binariesDir(): string {
    return path.join(this.installLocation, 'FactoryGame', 'Binaries', 'Win64');
  }

  get displayName(): string {
    return `${this.name} - CL${this.version}`;
  }

  get modsDir(): string {
    return SH.getModsDir(this.installLocation);
  }

  get profileManifest(): string {
    return path.join(getProfileFolderPath(this._profile), 'manifest.json');
  }

  get profileLockfile(): string {
    return path.join(getProfileFolderPath(this._profile), this.lockfileName);
  }

  get lockfileName(): string {
    return `lock-${hashString(`${this.installLocation}|${this.branch}`)}.json`;
  }

  readManifest(): Manifest {
    return readManifest(this.profileManifest);
  }

  readLockfile(): Lockfile {
    return readLockfile(this.profileLockfile);
  }
}
