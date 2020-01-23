import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { satisfies } from 'semver';
import { downloadFile, info } from './utils';
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

export function getSMLDownloadLink(version: string): string {
  // if (semver.satisfies(version, '<2.0.0')) {
  return `https://github.com/satisfactorymodding/SatisfactoryModLoader/releases/download/${version}/xinput1_3.dll`;
  // }
  // throw new Error('Not implemented');
}

export function getSMLVersion(satisfactoryPath: string): string | undefined {
  return smlVersionNative.getSMLVersion(satisfactoryPath);
}

export function getModsDir(satisfactoryPath: string): string {
  return path.join(satisfactoryPath, 'mods');
}

function getActualModsDir(satisfactoryPath: string, version: string): string {
  if (satisfies(version, '<2.0.0')) {
    return path.join(satisfactoryPath, 'FactoryGame', 'Binaries', 'Win64', 'mods');
  }
  return path.join(satisfactoryPath, 'mods');
}

function installSymlink(satisfactoryPath: string, version: string): void {
  const modsDir = getModsDir(satisfactoryPath);
  const actualModsDir = getActualModsDir(satisfactoryPath, version);
  if (modsDir === actualModsDir) {
    return;
  }
  if (fs.existsSync(actualModsDir)) {
    info('Mods directory already exists. Renaming to mods-backup');
    fs.renameSync(actualModsDir, `${actualModsDir}-backup`);
  }
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
  }
  fs.symlinkSync(modsDir, actualModsDir);
}

function uninstallSymlink(satisfactoryPath: string, version: string): void {
  const actualModsDir = getActualModsDir(satisfactoryPath, version);
  if (fs.existsSync(actualModsDir)) {
    fs.unlinkSync(actualModsDir);
  }
}

export async function installSML(version: string, satisfactoryPath: string): Promise<void> {
  if (!getSMLVersion(satisfactoryPath)) {
    const smlDownloadLink = getSMLDownloadLink(version);
    try {
      await downloadFile(smlDownloadLink,
        path.join(satisfactoryPath, getSMLRelativePath(version)));
      installSymlink(satisfactoryPath, version);
    } catch (e) {
      if (version.startsWith('v')) {
        throw new ModNotFoundError(`SML version ${version.substr(1)} not found`);
      }
      await installSML(`v${version}`, satisfactoryPath);
    }
  }
}

export async function uninstallSML(satisfactoryPath: string): Promise<void> {
  const smlVersion = getSMLVersion(satisfactoryPath);
  if (!smlVersion) {
    return;
  }
  if (fs.existsSync(path.join(satisfactoryPath, getSMLRelativePath(smlVersion)))) {
    fs.unlinkSync(path.join(satisfactoryPath, getSMLRelativePath(smlVersion)));
    uninstallSymlink(satisfactoryPath, smlVersion);
  }
}
