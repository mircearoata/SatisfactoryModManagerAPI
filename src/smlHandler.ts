import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { satisfies } from 'semver';
import glob from 'glob';
import {
  downloadFile, deleteFolderRecursive, smlCacheDir, ensureExists,
} from './utils';
import { ModNotFoundError } from './errors';
import { debug } from './logging';

const smlVersionNative = bindings('smlVersion');

const oldSMLFiles = ['FactoryGame/Binaries/Win64/mods', 'FactoryGame/Binaries/Win64/configs', 'FactoryGame/Content/Paks/!(FactoryGame-WindowsNoEditor).*', 'FactoryGame/Binaries/Win64/xinput1_3.dll'];

export const minSMLVersion = '2.0.0';
export const SMLModID = 'SML';

const SMLFileName = 'UE4-SML-Win64-Shipping.dll';

export const SMLRelativePath = path.join('loaders', SMLFileName); // TODO: other platforms

export function getSMLDownloadLink(version: string): string {
  return `https://github.com/satisfactorymodding/SatisfactoryModLoader/releases/download/${version}/UE4-SML-Win64-Shipping.dll`; // TODO: probably right, but better check
}

export function getSMLVersion(satisfactoryPath: string): string | undefined {
  return smlVersionNative.getSMLVersion(satisfactoryPath);
}

export function getModsDir(satisfactoryPath: string): string {
  return path.join(satisfactoryPath, 'mods');
}

async function getSMLVersionCache(version: string): Promise<string> {
  const smlVersionCacheDir = path.join(smlCacheDir, version);
  if (!fs.existsSync(smlVersionCacheDir)) {
    const smlDownloadLink = getSMLDownloadLink(version);
    try {
      await downloadFile(smlDownloadLink,
        path.join(smlVersionCacheDir, SMLFileName));
      debug(`SML ${version} is not cached. Downloading`);
    } catch (e) {
      if (e.statusCode === 404) {
        if (version.startsWith('v')) {
          throw new ModNotFoundError(`SML version ${version.substr(1)} not found`);
        }
        return getSMLVersionCache(`v${version}`);
      }
      throw e;
    }
  }
  return smlVersionCacheDir;
}

export async function installSML(version: string, satisfactoryPath: string): Promise<void> {
  if (!getSMLVersion(satisfactoryPath)) {
    const smlVersionCache = await getSMLVersionCache(version);
    ensureExists(path.dirname(path.join(satisfactoryPath, SMLRelativePath)));
    fs.copyFileSync(path.join(smlVersionCache, SMLFileName), path.join(satisfactoryPath, SMLRelativePath));
  }
}

export async function uninstallSML(satisfactoryPath: string): Promise<void> {
  const smlVersion = getSMLVersion(satisfactoryPath);
  if (!smlVersion) {
    return;
  }
  if (satisfies(smlVersion, '<2.0.0')) {
    // Cleanup old files
    oldSMLFiles.forEach((fileRelativePath) => {
      const oldFilePath = path.join(satisfactoryPath, fileRelativePath);
      if (fs.existsSync(oldFilePath)) {
        if (fs.lstatSync(oldFilePath).isFile()) {
          fs.unlinkSync(oldFilePath);
        } else {
          deleteFolderRecursive(oldFilePath);
        }
      } else {
        glob(oldFilePath, (er, files) => {
          files.forEach((file) => {
            fs.unlinkSync(file);
          });
        });
      }
    });
  }
  if (fs.existsSync(path.join(satisfactoryPath, SMLRelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, SMLRelativePath));
  }
}
