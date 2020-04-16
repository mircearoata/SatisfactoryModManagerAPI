import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import {
  downloadFile, bootstrapperCacheDir, ensureExists, deleteFolderRecursive,
} from './utils';
import { ModNotFoundError } from './errors';
import { debug } from './logging';

const bootstrapperVersionNative = bindings('bootstrapperVersion');

export const BootstrapperModID = 'bootstrapper';

const bootstrapperFileName = 'xinput1_3.dll';
const bootstrapperDIAFileName = 'msdia140.dll';

export const bootstrapperRelativePath = path.join('FactoryGame', 'Binaries', 'Win64', bootstrapperFileName); // TODO: support other platforms
export const bootstrapperDIARelativePath = path.join('FactoryGame', 'Binaries', 'Win64', bootstrapperDIAFileName); // TODO: support other platforms

export function getBootstrapperDownloadLink(version: string): string {
  return `https://github.com/satisfactorymodding/SatisfactoryModBootstrapper/releases/download/${version}/xinput1_3.dll`;
}

export function getBootstrapperDIADownloadLink(version: string): string {
  return `https://github.com/satisfactorymodding/SatisfactoryModBootstrapper/releases/download/${version}/msdia140.dll`;
}

export function getBootstrapperVersion(satisfactoryPath: string): string | undefined {
  return bootstrapperVersionNative.getBootstrapperVersion(satisfactoryPath);
}

async function getBootstrapperVersionCache(version: string): Promise<string> {
  const bootstrapperVersionCacheDir = path.join(bootstrapperCacheDir, version);
  const bootstrapperVersionCacheDirWithV = path.join(bootstrapperCacheDir, `v${version}`);
  if (!fs.existsSync(bootstrapperVersionCacheDir) && !fs.existsSync(bootstrapperVersionCacheDirWithV)) {
    const bootstrapperDownloadLink = getBootstrapperDownloadLink(version);
    const bootstrapperDIADownloadLink = getBootstrapperDIADownloadLink(version);
    try {
      await downloadFile(bootstrapperDownloadLink,
        path.join(bootstrapperVersionCacheDir, bootstrapperFileName));
      await downloadFile(bootstrapperDIADownloadLink,
        path.join(bootstrapperVersionCacheDir, bootstrapperDIAFileName));
      debug(`Bootstrapper ${version} is not cached. Downloading`);
    } catch (e) {
      if (e.statusCode === 404) {
        if (version.startsWith('v')) {
          throw new ModNotFoundError(`Bootstrapper version ${version.substr(1)} not found`);
        }
        return getBootstrapperVersionCache(`v${version}`);
      }
      throw e;
    }
  }
  if (fs.existsSync(bootstrapperVersionCacheDir)) {
    return bootstrapperVersionCacheDir;
  }
  return bootstrapperVersionCacheDirWithV;
}


export async function installBootstrapper(version: string, satisfactoryPath: string): Promise<void> {
  if (!getBootstrapperVersion(satisfactoryPath)) {
    let bootstrapperVersionCache = await getBootstrapperVersionCache(version);
    if (!fs.existsSync(path.join(bootstrapperVersionCache, bootstrapperFileName))
    || !fs.existsSync(path.join(bootstrapperVersionCache, bootstrapperDIAFileName))) {
      deleteFolderRecursive(bootstrapperVersionCache);
      bootstrapperVersionCache = await getBootstrapperVersionCache(version);
    }
    ensureExists(path.dirname(path.join(satisfactoryPath, bootstrapperRelativePath)));
    ensureExists(path.dirname(path.join(satisfactoryPath, bootstrapperDIARelativePath)));
    fs.copyFileSync(path.join(bootstrapperVersionCache, bootstrapperFileName), path.join(satisfactoryPath, bootstrapperRelativePath));
    fs.copyFileSync(path.join(bootstrapperVersionCache, bootstrapperDIAFileName), path.join(satisfactoryPath, bootstrapperDIARelativePath));
  }
}

export async function uninstallBootstrapper(satisfactoryPath: string): Promise<void> {
  const bootstrapperVersion = getBootstrapperVersion(satisfactoryPath);
  if (!bootstrapperVersion) {
    return;
  }
  if (fs.existsSync(path.join(satisfactoryPath, bootstrapperRelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, bootstrapperRelativePath));
  }
  if (fs.existsSync(path.join(satisfactoryPath, bootstrapperDIARelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, bootstrapperDIARelativePath));
  }
}
