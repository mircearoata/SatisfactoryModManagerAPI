import path from 'path';
import fs from 'fs';
import { eq } from 'semver';
import JSZip from 'jszip';
import * as MH from './modHandler';
import * as SH from './smlHandler';
import * as BH from './bootstrapperHandler';
import {
  FicsitAppVersion, FicsitAppMod, FicsitAppSMLVersion, FicsitAppBootstrapperVersion,
  getModReferenceFromId, getModVersions, getAvailableSMLVersions, getAvailableBootstrapperVersions,
} from './ficsitApp';
import {
  ManifestItem, mutateManifest, readManifest, readLockfile, getItemsList, writeManifest, writeLockfile, ManifestVersion, Manifest,
} from './manifest';
import { ItemVersionList, Lockfile } from './lockfile';
import {
  filterObject, mergeArrays, isRunning, ensureExists, profileFolder, dirs, deleteFolderRecursive, validAndGreater, hashString,
} from './utils';
import {
  debug, info, error, warn,
} from './logging';
import {
  GameRunningError, InvalidProfileError,
} from './errors';

export function getProfileFolderPath(profileName: string): string {
  const profilePath = path.join(profileFolder, profileName);
  ensureExists(profilePath);
  return profilePath;
}

export function profileExists(profileName: string): boolean {
  const profilePath = path.join(profileFolder, profileName);
  return fs.existsSync(profilePath);
}

const VANILLA_PROFILE_NAME = 'vanilla';
const MODDED_PROFILE_NAME = 'modded';
const DEVELOPMENT_PROFILE_NAME = 'development';

const CacheRelativePath = '.cache';

export interface ItemUpdate {
  item: string;
  currentVersion: string;
  version: string;
  releases: Array<FicsitAppVersion | FicsitAppSMLVersion | FicsitAppBootstrapperVersion>;
}

export interface ProfileMetadata {
  gameVersion: string;
}

export class SatisfactoryInstall {
  name: string;
  version: string;
  branch: string;
  installLocation: string;
  launchPath: string;

  private _profile = MODDED_PROFILE_NAME;

  constructor(name: string, version: string, branch: string, installLocation: string, launchPath: string) {
    this.name = name;
    this.version = version;
    this.branch = branch;
    this.installLocation = installLocation;
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
    if (this._profile === VANILLA_PROFILE_NAME && (install.length > 0 || update.length > 0)) {
      throw new InvalidProfileError('Cannot modify vanilla profile. Use "modded" profile or create a new profile');
    }
    if (!await SatisfactoryInstall.isGameRunning()) {
      debug(`install: [${install.map((item) => (item.version ? `${item.id}@${item.version}` : item.id)).join(', ')}], uninstall: [${uninstall.join(', ')}], update: [${update.join(', ')}]`);
      const currentManifest = readManifest(this.profileManifest);
      const currentLockfile = readLockfile(this.profileLockfile);
      try {
        const {
          manifest: newManifest,
          lockfile: newLockfile,
        } = await mutateManifest({ manifest: currentManifest, lockfile: currentLockfile }, this.version, install, uninstall, update);
        await this.validateInstall(getItemsList(newLockfile));
        writeManifest(this.profileManifest, newManifest);
        writeLockfile(this.profileLockfile, newLockfile);
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

  async setProfile(profileName: string): Promise<void> {
    const currentProfile = this._profile;
    this._profile = profileName;
    try {
      await this.manifestMutate([], [], []);
    } catch (e) {
      this._profile = currentProfile;
      throw new InvalidProfileError(`Error while loading profile: ${e.message}`);
    }
  }

  get profile(): string {
    return this._profile;
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
    info(`Installing ${modReference}${version ? `@${version}` : ''}`);
    await this._installItem(modReference, version);
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

  get manifestMods(): ManifestItem[] {
    return readManifest(this.profileManifest).items
      .filter((item) => item.id !== SH.SMLID && item.id !== BH.BootstrapperID);
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
    return readManifest(this.profileManifest).items.some((item) => item.id === SH.SMLID);
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
    const currentManifest = readManifest(this.profileManifest);
    const currentLockfile = readLockfile(this.profileLockfile);
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
    const manifest = readManifest(this.profileManifest);
    const lockfile = readLockfile(this.profileLockfile);
    const metadata = { gameVersion: this.version } as ProfileMetadata;

    const profileFile = new JSZip();
    profileFile.file('manifest.json', JSON.stringify(manifest));
    profileFile.file('lockfile.json', JSON.stringify(lockfile));
    profileFile.file('metadata.json', JSON.stringify(metadata));

    return new Promise((resolve, reject) => {
      profileFile.generateNodeStream().pipe(fs.createWriteStream(filePath)).on('finish', resolve).on('error', reject);
    });
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
    return getItemsList(readLockfile(this.profileLockfile));
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

  get profileManifest(): string {
    return path.join(getProfileFolderPath(this._profile), 'manifest.json');
  }

  get profileLockfile(): string {
    return path.join(getProfileFolderPath(this._profile), this.lockfileName);
  }

  get lockfileName(): string {
    return `lock-${hashString(`${this.installLocation}|${this.branch}`)}.json`;
  }
}

export function getProfiles(): Array<{name: string; items: ManifestItem[]}> {
  return dirs(profileFolder).sort().map((name) => {
    const manifest = readManifest(path.join(getProfileFolderPath(name), 'manifest.json'));
    return { name, items: manifest.items };
  });
}

export function deleteProfile(name: string): void {
  if (name.toLowerCase() === VANILLA_PROFILE_NAME || name.toLowerCase() === MODDED_PROFILE_NAME || name.toLowerCase() === DEVELOPMENT_PROFILE_NAME) {
    throw new InvalidProfileError(`Cannot delete ${name} profile (it is part of the default set of profiles)`);
  }
  if (profileExists(name)) {
    deleteFolderRecursive(getProfileFolderPath(name));
  }
}

export function createProfile(name: string, copyProfile = 'vanilla'): void {
  if (profileExists(name)) {
    throw new InvalidProfileError(`Profile ${name} already exists`);
  }
  if (!profileExists(copyProfile)) {
    throw new InvalidProfileError(`Profile ${copyProfile} does not exist`);
  }
  writeManifest(path.join(getProfileFolderPath(name), 'manifest.json'), readManifest(path.join(getProfileFolderPath(copyProfile), 'manifest.json')));
}

if (!fs.existsSync(path.join(getProfileFolderPath(VANILLA_PROFILE_NAME), 'manifest.json'))) {
  writeManifest(path.join(getProfileFolderPath(VANILLA_PROFILE_NAME), 'manifest.json'), { items: new Array<ManifestItem>(), manifestVersion: ManifestVersion.Latest });
}

if (!fs.existsSync(path.join(getProfileFolderPath(MODDED_PROFILE_NAME), 'manifest.json'))) {
  writeManifest(path.join(getProfileFolderPath(MODDED_PROFILE_NAME), 'manifest.json'), { items: new Array<ManifestItem>(), manifestVersion: ManifestVersion.Latest });
}

if (!fs.existsSync(path.join(getProfileFolderPath(DEVELOPMENT_PROFILE_NAME), 'manifest.json'))) {
  writeManifest(path.join(getProfileFolderPath(DEVELOPMENT_PROFILE_NAME), 'manifest.json'), { items: [{ id: SH.SMLID }], manifestVersion: ManifestVersion.Latest });
}
