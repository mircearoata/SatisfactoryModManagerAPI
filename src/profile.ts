import path from 'path';
import fs from 'fs';
import filenamify from 'filenamify';
import {
  ManifestItem, readManifest, writeManifest, ManifestVersion,
} from './manifest';
import {
  dirs, deleteFolderRecursive, SMLID,
} from './utils';
import {
  error,
} from './logging';
import {
  InvalidProfileError,
} from './errors';
import { appDataDir, ensureExists } from './paths';

export const profileFolder = path.join(appDataDir, 'profiles');
if (fs.existsSync(path.join(appDataDir, 'configs')) && !fs.existsSync(profileFolder)) {
  fs.renameSync(path.join(appDataDir, 'configs'), profileFolder);
}
ensureExists(profileFolder);

export const VANILLA_PROFILE_NAME = 'vanilla';
export const MODDED_PROFILE_NAME = 'modded';
export const DEVELOPMENT_PROFILE_NAME = 'development';

export interface ProfileMetadata {
  gameVersion: string;
}

export function getProfileFolderPath(profileName: string): string {
  const profilePath = path.join(profileFolder, profileName);
  ensureExists(profilePath);
  return profilePath;
}

export function profileExists(profileName: string): boolean {
  const profilePath = path.join(profileFolder, profileName);
  return fs.existsSync(profilePath);
}

export function getProfiles(): Array<{ name: string, items: ManifestItem[] }> {
  return dirs(profileFolder).sort().map((name) => {
    try {
      const manifest = readManifest(path.join(getProfileFolderPath(name), 'manifest.json'));
      return { name, items: manifest.items };
    } catch (e) {
      error(`Error while reading profile manifest ${name}: ${e.message}`);
      return { name, items: [] };
    }
  });
}

function isBuiltinProfile(name: string): boolean {
  return name.toLowerCase() === VANILLA_PROFILE_NAME || name.toLowerCase() === MODDED_PROFILE_NAME || name.toLowerCase() === DEVELOPMENT_PROFILE_NAME;
}

export function deleteProfile(name: string): void {
  if (isBuiltinProfile(name)) {
    throw new InvalidProfileError(`Cannot delete ${name} profile (it is part of the default set of profiles)`);
  }
  if (profileExists(name)) {
    deleteFolderRecursive(getProfileFolderPath(name));
  }
}

export function createProfile(name: string, copyProfile = 'vanilla'): void {
  const validName = filenamify(name, { replacement: '_' });
  if (profileExists(validName)) {
    throw new InvalidProfileError(`Profile ${validName} already exists`);
  }
  if (!profileExists(copyProfile)) {
    throw new InvalidProfileError(`Profile ${copyProfile} does not exist`);
  }
  writeManifest(path.join(getProfileFolderPath(validName), 'manifest.json'), readManifest(path.join(getProfileFolderPath(copyProfile), 'manifest.json')));
}

export function renameProfile(oldName: string, newName: string): void {
  if (isBuiltinProfile(oldName)) {
    throw new InvalidProfileError(`Cannot rename ${oldName} profile (it is part of the default set of profiles)`);
  }
  const validName = filenamify(oldName, { replacement: '_' });
  const validNewName = filenamify(newName, { replacement: '_' });
  if (!profileExists(validName)) {
    throw new InvalidProfileError(`Profile ${validName} does not exist.`);
  }
  if (profileExists(validNewName)) {
    throw new InvalidProfileError(`Profile ${validNewName} already exists.`);
  }
  fs.renameSync(getProfileFolderPath(validName), path.join(profileFolder, validNewName));
}

if (!fs.existsSync(path.join(getProfileFolderPath(VANILLA_PROFILE_NAME), 'manifest.json'))) {
  writeManifest(path.join(getProfileFolderPath(VANILLA_PROFILE_NAME), 'manifest.json'), { items: new Array<ManifestItem>(), manifestVersion: ManifestVersion.Latest });
}

if (!fs.existsSync(path.join(getProfileFolderPath(MODDED_PROFILE_NAME), 'manifest.json'))) {
  writeManifest(path.join(getProfileFolderPath(MODDED_PROFILE_NAME), 'manifest.json'), { items: new Array<ManifestItem>(), manifestVersion: ManifestVersion.Latest });
}

if (!fs.existsSync(path.join(getProfileFolderPath(DEVELOPMENT_PROFILE_NAME), 'manifest.json'))) {
  writeManifest(path.join(getProfileFolderPath(DEVELOPMENT_PROFILE_NAME), 'manifest.json'), { items: [{ id: SMLID, enabled: true }], manifestVersion: ManifestVersion.Latest });
}
