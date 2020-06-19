import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { valid, coerce } from 'semver';
import {
  downloadFile, bootstrapperCacheDir, ensureExists, deleteFolderRecursive, fileURLExists,
} from './utils';
import { ModNotFoundError } from './errors';
import { debug } from './logging';

const bootstrapperVersionNative = bindings('bootstrapperVersion');

export const BootstrapperID = 'bootstrapper';

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
  return fs.existsSync(path.join(satisfactoryPath, bootstrapperDIARelativePath))
    ? bootstrapperVersionNative.getBootstrapperVersion(satisfactoryPath)
    : undefined;
}

async function getBootstrapperVersionCache(version: string): Promise<string> {
  const validVersion = valid(coerce(version));
  if (!validVersion) {
    throw new ModNotFoundError(`bootstrapper@${version} not found.`, 'bootstrapper', version);
  }
  const bootstrapperVersionCacheDir = path.join(bootstrapperCacheDir, validVersion);
  const bootstrapperCacheFile = path.join(bootstrapperVersionCacheDir, bootstrapperFileName);
  const bootstrapperCacheDIAFile = path.join(bootstrapperVersionCacheDir, bootstrapperDIAFileName);
  if (!fs.existsSync(bootstrapperVersionCacheDir)) {
    debug(`Bootstrapper@${version} is not cached. Downloading`);
    const bootstrapperDownloadLink = getBootstrapperDownloadLink(validVersion);
    const bootstrapperDIADownloadLink = getBootstrapperDIADownloadLink(validVersion);
    if (await fileURLExists(bootstrapperDownloadLink)) {
      await downloadFile(bootstrapperDownloadLink, bootstrapperCacheFile, 'Bootstrappper (1/2)', validVersion);
      await downloadFile(bootstrapperDIADownloadLink, bootstrapperCacheDIAFile, 'Bootstrappper (2/2)', validVersion);
    } else {
      const bootstrapperDownloadLinkWithV = getBootstrapperDownloadLink(`v${validVersion}`);
      const bootstrapperDIADownloadLinkWithV = getBootstrapperDIADownloadLink(`v${validVersion}`);
      if (await fileURLExists(bootstrapperDownloadLinkWithV)) {
        await downloadFile(bootstrapperDownloadLinkWithV, bootstrapperCacheFile, 'Bootstrappper (1/2)', validVersion);
        await downloadFile(bootstrapperDIADownloadLinkWithV, bootstrapperCacheDIAFile, 'Bootstrappper (2/2)', validVersion);
      } else {
        throw new ModNotFoundError(`bootstrapper@${version} not found.`, 'bootstrapper', version);
      }
    }
  }
  return bootstrapperVersionCacheDir;
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
