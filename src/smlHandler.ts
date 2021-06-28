import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { valid, coerce, satisfies } from 'semver';
import StreamZip from 'node-stream-zip';
import {
  downloadFile, isValidZip,
} from './utils';
import { ModNotFoundError } from './errors';
import { debug } from './logging';
import { getSMLVersionInfo } from './ficsitApp';
import { smlCacheDir, ensureExists } from './paths';
import { UPlugin } from './uplugin';

const smlVersionNative = bindings('smlVersion');

const SMLDLLFileName = 'UE4-SML-Win64-Shipping.dll';
const SMLPakFileName = 'SML.pak';
const SMLZipFileName = 'SML.smod';

export const SMLDLLRelativePath = path.join('loaders', SMLDLLFileName);
export const SMLPakRelativePath = path.join('loaders', SMLPakFileName);
export const SML3xRelativePath = path.join('FactoryGame', 'Mods', 'SML');
export const SML3xUPluginRelativePath = path.join(SML3xRelativePath, 'SML.uplugin');

export function getSMLVersion(satisfactoryPath: string): string | undefined {
  if (fs.existsSync(path.join(satisfactoryPath, SMLDLLRelativePath))) {
    // SML 2.x
    return smlVersionNative.getSMLVersion(path.join(satisfactoryPath, SMLDLLRelativePath));
  }
  // SML 3.x
  if (fs.existsSync(path.join(satisfactoryPath, SML3xUPluginRelativePath))) {
    const uplugin = JSON.parse(fs.readFileSync(path.join(satisfactoryPath, SML3xUPluginRelativePath), { encoding: 'utf8' })) as UPlugin;
    return uplugin.SemVersion || valid(uplugin.VersionName) || `${uplugin.Version}.0.0`;
  }
  return undefined;
}

export enum SMLVersion {
  'v2_x',
  'v3_x'
}

export function getSMLVersionEnum(satisfactoryPath: string): SMLVersion {
  return satisfies(getSMLVersion(satisfactoryPath) || '0.0.0', '>=3.0.0') ? SMLVersion.v3_x : SMLVersion.v2_x;
}

export function getModsDir(satisfactoryPath: string): string {
  const smlVersion = getSMLVersion(satisfactoryPath) || '0.0.0';
  if (satisfies(smlVersion, '>=3.0.0')) {
    return path.join(satisfactoryPath, 'FactoryGame', 'Mods');
  }
  return path.join(satisfactoryPath, 'mods');
}

async function getSMLVersionCache(version: string): Promise<string> {
  const validVersion = valid(coerce(version));
  if (!validVersion) {
    throw new ModNotFoundError(`SML@${version} not found.`, 'SML', version);
  }
  const smlVersionCacheDir = path.join(smlCacheDir, validVersion);
  if (satisfies(validVersion, '>=3.0.0')) {
    const smlZipCacheFile = path.join(smlVersionCacheDir, SMLZipFileName);
    if (!fs.existsSync(smlZipCacheFile) || !await isValidZip(smlZipCacheFile)) {
      debug(`SML@${version} is not cached. Downloading`);
      const smlReleaseURL = (await getSMLVersionInfo(version))?.link;
      if (!smlReleaseURL) {
        throw new ModNotFoundError(`SML@${version} not found.`, 'SML', version);
      }
      const smlZipDownloadLink = `${smlReleaseURL.replace('/tag/', '/download/')}/SML.zip`;
      await downloadFile(smlZipDownloadLink, smlZipCacheFile, 'SML', validVersion);
    }
  } else {
    const smlDLLVerionCacheFile = path.join(smlVersionCacheDir, SMLDLLFileName);
    const smlPakVerionCacheFile = path.join(smlVersionCacheDir, SMLPakFileName);
    if (!fs.existsSync(smlVersionCacheDir)) {
      debug(`SML@${version} is not cached. Downloading`);
      const smlReleaseURL = (await getSMLVersionInfo(version))?.link;
      if (!smlReleaseURL) {
        throw new ModNotFoundError(`SML@${version} not found.`, 'SML', version);
      }
      const smlDLLDownloadLink = `${smlReleaseURL.replace('/tag/', '/download/')}/${SMLDLLFileName}`;
      const smlPakDownloadLink = `${smlReleaseURL.replace('/tag/', '/download/')}/${SMLPakFileName}`;
      let hasPak = true;
      try {
        await downloadFile(smlPakDownloadLink, smlPakVerionCacheFile, 'SML (1/2)', validVersion);
      } catch (e) {
        hasPak = false;
        debug(`Pak of SML version ${version} not found.`);
      }
      await downloadFile(smlDLLDownloadLink, smlDLLVerionCacheFile, `SML ${hasPak ? '(2/2)' : '(1/1)'}`, validVersion);
    }
  }
  return smlVersionCacheDir;
}

export async function installSML(version: string, satisfactoryPath: string): Promise<void> {
  if (!getSMLVersion(satisfactoryPath)) {
    debug(`Installing SML@${version}`);
    const smlVersionCache = await getSMLVersionCache(version);
    if (satisfies(version, '>=3.0.0')) {
      const extractPath = path.join(satisfactoryPath, SML3xRelativePath);
      // eslint-disable-next-line new-cap
      const zipData = new StreamZip.async({ file: path.join(smlVersionCache, SMLZipFileName) });
      ensureExists(extractPath);
      await zipData.extract(null, extractPath);
      zipData.close();
    } else {
      ensureExists(path.dirname(path.join(satisfactoryPath, SMLDLLRelativePath)));
      ensureExists(path.dirname(path.join(satisfactoryPath, SMLPakRelativePath)));
      fs.copyFileSync(path.join(smlVersionCache, SMLDLLFileName), path.join(satisfactoryPath, SMLDLLRelativePath));
      if (fs.existsSync(path.join(smlVersionCache, SMLPakFileName))) {
        fs.copyFileSync(path.join(smlVersionCache, SMLPakFileName), path.join(satisfactoryPath, SMLPakRelativePath));
      }
    }
  } else {
    debug('SML is already installed');
  }
}

export async function uninstallSML(satisfactoryPath: string): Promise<void> {
  const smlVersion = getSMLVersion(satisfactoryPath);
  if (!smlVersion) {
    debug('No SML to uninstall');
    return;
  }
  debug('Uninstalling SML');
  if (satisfies(getSMLVersion(satisfactoryPath) || '0.0.0', '>=3.0.0')) {
    const smlPath = path.join(satisfactoryPath, SML3xRelativePath);
    fs.rmdirSync(smlPath, { recursive: true });
  } else {
    if (fs.existsSync(path.join(satisfactoryPath, SMLDLLRelativePath))) {
      fs.unlinkSync(path.join(satisfactoryPath, SMLDLLRelativePath));
    }
    if (fs.existsSync(path.join(satisfactoryPath, SMLPakRelativePath))) {
      fs.unlinkSync(path.join(satisfactoryPath, SMLPakRelativePath));
    }
  }
}
