import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { satisfies } from 'semver';
import { downloadFile } from './utils';
import { ModNotFoundError } from './errors';

const smlVersionNative = bindings('smlVersion');

export function getSMLRelativePath(version: string): string {
  if (satisfies(version, '<2.0.0')) {
    return path.join('FactoryGame', 'Binaries', 'Win64', 'xinput1_3.dll');
  }
  return path.join('loaders', 'UE4-SML-Win64-Shipping.dll');
  // bootstrapper?
  // probably another handler for it
}

export async function getSMLDownloadLink(version: string): Promise<string> {
  // if (semver.satisfies(version, '<2.0.0')) {
  return `https://github.com/satisfactorymodding/SatisfactoryModLoader/releases/download/${version}/xinput1_3.dll`;
  // }
  // throw new Error('Not implemented');
}

export async function getSMLVersion(satisfactoryPath: string): Promise<string | undefined> {
  return smlVersionNative.getSMLVersion(satisfactoryPath);
}

export async function installSML(version: string, satisfactoryPath: string): Promise<void> {
  if (!await getSMLVersion(satisfactoryPath)) {
    const smlDownloadLink = await getSMLDownloadLink(version);
    try {
      await downloadFile(smlDownloadLink,
        path.join(satisfactoryPath, getSMLRelativePath(version)));
    } catch (e) {
      if (version.startsWith('v')) {
        throw new ModNotFoundError(`SML version ${version.substr(1)} not found`);
      }
      await installSML(`v${version}`, satisfactoryPath);
    }
  }
}

export async function uninstallSML(satisfactoryPath: string): Promise<void> {
  const smlVersion = await getSMLVersion(satisfactoryPath);
  if (!smlVersion) {
    return;
  }
  fs.unlinkSync(path.join(satisfactoryPath, getSMLRelativePath(smlVersion)));
}

export async function getModsDir(satisfactoryPath: string): Promise<string> {
  let smlVersion = await getSMLVersion(satisfactoryPath);
  if (!smlVersion) {
    smlVersion = '1.1.0'; // default to pre 2.0. Should default to 2.0 after 2.0 is released
  }
  if (satisfies(smlVersion, '<2.0.0')) {
    return path.join(satisfactoryPath, 'FactoryGame', 'Binaries', 'Win64', 'mods');
  }
  return path.join(satisfactoryPath, 'mods');
}
