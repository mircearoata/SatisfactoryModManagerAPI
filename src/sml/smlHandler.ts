import path from 'path';
import fs from 'fs';
import { valid, satisfies } from 'semver';
import StreamZip from 'node-stream-zip';
import { debug } from '../logging';
import { ensureExists } from '../paths';
import { UPlugin } from '../mods/uplugin';
import { getSMLVersionCache } from './smlCache';
import {
  SMLDLLRelativePath, SMLPakRelativePath, SMLZipFileName, SML3xRelativePath, SML3xUPluginRelativePath,
} from './sml';

export function getSMLVersion(satisfactoryPath: string): string | undefined {
  // SML 3.x
  if (fs.existsSync(path.join(satisfactoryPath, SML3xUPluginRelativePath))) {
    const uplugin = JSON.parse(fs.readFileSync(path.join(satisfactoryPath, SML3xUPluginRelativePath), { encoding: 'utf8' })) as UPlugin;
    return uplugin.SemVersion || valid(uplugin.VersionName) || `${uplugin.Version}.0.0`;
  }
  if (fs.existsSync(path.join(satisfactoryPath, SMLDLLRelativePath))) {
    // SML 2.x
    return '2.2.1';
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

export async function installSML(version: string, satisfactoryPath: string): Promise<void> {
  if (!satisfies(version, '>=3.0.0')) {
    throw new Error('SML 2.x is not supported');
  }
  if (!getSMLVersion(satisfactoryPath)) {
    debug(`Installing SML@${version}`);
    const smlVersionCache = await getSMLVersionCache(version);
    const extractPath = path.join(satisfactoryPath, SML3xRelativePath);
    // eslint-disable-next-line new-cap
    const zipData = new StreamZip.async({ file: path.join(smlVersionCache, SMLZipFileName) });
    ensureExists(extractPath);
    await zipData.extract(null, extractPath);
    await zipData.close();
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
