import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import {
  downloadFile,
} from './utils';
import { ModNotFoundError } from './errors';

const smlVersionNative = bindings('smlVersion');

export const minSMLVersion = '2.0.0';
export const SMLModID = 'SML';

export const SMLRelativePath = path.join('loaders', 'UE4-SML-Win64-Shipping.dll'); // TODO: other platforms

export function getSMLDownloadLink(version: string): string {
  return `https://github.com/satisfactorymodding/SatisfactoryModLoader/releases/download/${version}/UE4-SML-Win64-Shipping.dll`; // TODO: probably right, but better check
}

export function getSMLVersion(satisfactoryPath: string): string | undefined {
  return smlVersionNative.getSMLVersion(satisfactoryPath);
}

export function getModsDir(satisfactoryPath: string): string {
  return path.join(satisfactoryPath, 'mods');
}

export async function installSML(version: string, satisfactoryPath: string): Promise<void> {
  if (!getSMLVersion(satisfactoryPath)) {
    const smlDownloadLink = getSMLDownloadLink(version);
    try {
      await downloadFile(smlDownloadLink,
        path.join(satisfactoryPath, SMLRelativePath));
    } catch (e) {
      if (e.statusCode === 404) {
        if (version.startsWith('v')) {
          throw new ModNotFoundError(`SML version ${version.substr(1)} not found`);
        }
        await installSML(`v${version}`, satisfactoryPath);
      } else {
        throw e;
      }
    }
  }
}

export async function uninstallSML(satisfactoryPath: string): Promise<void> {
  const smlVersion = getSMLVersion(satisfactoryPath);
  if (!smlVersion) {
    return;
  }
  if (fs.existsSync(path.join(satisfactoryPath, SMLRelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, SMLRelativePath));
  }
}
