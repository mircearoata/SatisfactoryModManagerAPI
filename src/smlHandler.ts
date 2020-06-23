import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { valid, coerce } from 'semver';
import {
  downloadFile, smlCacheDir, ensureExists, fileURLExists,
} from './utils';
import { ModNotFoundError } from './errors';
import { debug } from './logging';

const smlVersionNative = bindings('smlVersion');

export const minSMLVersion = '2.0.0';
export const SMLID = 'SML';

const SMLDLLFileName = 'UE4-SML-Win64-Shipping.dll';
const SMLPakFileName = 'SML.pak';

export const SMLDLLRelativePath = path.join('loaders', SMLDLLFileName); // TODO: other platforms
export const SMLPakRelativePath = path.join('loaders', SMLPakFileName);

export function getSMLDLLDownloadLink(version: string): string {
  return `https://github.com/satisfactorymodding/SatisfactoryModLoader/releases/download/${version}/UE4-SML-Win64-Shipping.dll`;
}
export function getSMLPakDownloadLink(version: string): string {
  return `https://github.com/satisfactorymodding/SatisfactoryModLoader/releases/download/${version}/SML.pak`;
}

export function getSMLVersion(satisfactoryPath: string): string | undefined {
  return smlVersionNative.getSMLVersion(satisfactoryPath);
}

export function getModsDir(satisfactoryPath: string): string {
  return path.join(satisfactoryPath, 'mods');
}

async function getSMLVersionCache(version: string): Promise<string> {
  const validVersion = valid(coerce(version));
  if (!validVersion) {
    throw new ModNotFoundError(`SML@${version} not found.`, 'SML', version);
  }
  const smlVersionCacheDir = path.join(smlCacheDir, validVersion);
  const smlDLLVerionCacheFile = path.join(smlVersionCacheDir, SMLDLLFileName);
  const smlPakVerionCacheFile = path.join(smlVersionCacheDir, SMLPakFileName);
  if (!fs.existsSync(smlVersionCacheDir)) {
    debug(`SML@${version} is not cached. Downloading`);
    const smlDLLDownloadLink = getSMLDLLDownloadLink(validVersion);
    const smlPakDownloadLink = getSMLPakDownloadLink(validVersion);
    if (await fileURLExists(smlDLLDownloadLink)) {
      const hasPak = await fileURLExists(smlPakDownloadLink);
      await downloadFile(smlDLLDownloadLink, smlDLLVerionCacheFile, `SML ${hasPak ? '(1/2)' : '(1/1)'}`, validVersion);
      if (hasPak) {
        await downloadFile(smlPakDownloadLink, smlPakVerionCacheFile, 'SML (2/2)', validVersion);
      }
    } else {
      const smlDLLDownloadLinkWithV = getSMLDLLDownloadLink(`v${validVersion}`);
      const smlPakDownloadLinkWithV = getSMLDLLDownloadLink(`v${validVersion}`);
      if (await fileURLExists(smlDLLDownloadLinkWithV)) {
        const hasPak = await fileURLExists(smlPakDownloadLinkWithV);
        await downloadFile(smlDLLDownloadLinkWithV, smlDLLVerionCacheFile, `SML ${hasPak ? '(1/2)' : '(1/1)'}`, validVersion);
        if (hasPak) {
          await downloadFile(smlPakDownloadLinkWithV, smlPakVerionCacheFile, 'SML (2/2)', validVersion);
        }
      } else {
        throw new ModNotFoundError(`SML@${version} not found.`, 'SML', version);
      }
    }
  }
  return smlVersionCacheDir;
}

export async function installSML(version: string, satisfactoryPath: string): Promise<void> {
  if (!getSMLVersion(satisfactoryPath)) {
    const smlVersionCache = await getSMLVersionCache(version);
    ensureExists(path.dirname(path.join(satisfactoryPath, SMLDLLRelativePath)));
    ensureExists(path.dirname(path.join(satisfactoryPath, SMLPakRelativePath)));
    fs.copyFileSync(path.join(smlVersionCache, SMLDLLFileName), path.join(satisfactoryPath, SMLDLLRelativePath));
    if (fs.existsSync(path.join(smlVersionCache, SMLPakFileName))) {
      fs.copyFileSync(path.join(smlVersionCache, SMLPakFileName), path.join(satisfactoryPath, SMLPakRelativePath));
    }
  }
}

export async function uninstallSML(satisfactoryPath: string): Promise<void> {
  const smlVersion = getSMLVersion(satisfactoryPath);
  if (!smlVersion) {
    return;
  }
  if (fs.existsSync(path.join(satisfactoryPath, SMLDLLRelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, SMLDLLRelativePath));
  }
  if (fs.existsSync(path.join(satisfactoryPath, SMLPakRelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, SMLPakRelativePath));
  }
}
