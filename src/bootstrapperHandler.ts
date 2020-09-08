import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { valid, coerce } from 'semver';
import {
  downloadFile, deleteFolderRecursive,
} from './utils';
import { ModNotFoundError } from './errors';
import { debug } from './logging';
import { getBootstrapperVersionInfo } from './ficsitApp';
import { bootstrapperCacheDir, ensureExists } from './paths';

const bootstrapperVersionNative = bindings('bootstrapperVersion');

const bootstrapperFileName = 'xinput1_3.dll';
const bootstrapperDIAFileName = 'msdia140.dll';

export const bootstrapperRelativePath = path.join('FactoryGame', 'Binaries', 'Win64', bootstrapperFileName);
export const bootstrapperDIARelativePath = path.join('FactoryGame', 'Binaries', 'Win64', bootstrapperDIAFileName);

export function getBootstrapperVersion(satisfactoryPath: string): string | undefined {
  return fs.existsSync(path.join(satisfactoryPath, bootstrapperDIARelativePath))
    ? bootstrapperVersionNative.getBootstrapperVersion(path.join(satisfactoryPath, bootstrapperRelativePath))
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
    const bootstrapperReleaseURL = (await getBootstrapperVersionInfo(version))?.link;
    if (!bootstrapperReleaseURL) {
      throw new ModNotFoundError(`bootstrapper@${version} not found.`, 'bootstrapper', version);
    }
    const bootstrapperDownloadLink = `${bootstrapperReleaseURL.replace('/tag/', '/download/')}/${bootstrapperFileName}`;
    const bootstrapperDIADownloadLink = `${bootstrapperReleaseURL.replace('/tag/', '/download/')}/${bootstrapperDIAFileName}`;
    await downloadFile(bootstrapperDownloadLink, bootstrapperCacheFile, 'Bootstrapper (1/2)', validVersion);
    await downloadFile(bootstrapperDIADownloadLink, bootstrapperCacheDIAFile, 'Bootstrapper (2/2)', validVersion);
  }
  return bootstrapperVersionCacheDir;
}

export async function installBootstrapper(version: string, satisfactoryPath: string): Promise<void> {
  if (!getBootstrapperVersion(satisfactoryPath)) {
    debug('Installing bootstrapper');
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
  } else {
    debug('Bootstrapper is already installed');
  }
}

export async function uninstallBootstrapper(satisfactoryPath: string): Promise<void> {
  const bootstrapperVersion = getBootstrapperVersion(satisfactoryPath);
  if (!bootstrapperVersion) {
    debug('No bootstrapper to uninstall');
    return;
  }
  debug('Uninstalling bootstrapper');
  if (fs.existsSync(path.join(satisfactoryPath, bootstrapperRelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, bootstrapperRelativePath));
  }
  if (fs.existsSync(path.join(satisfactoryPath, bootstrapperDIARelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, bootstrapperDIARelativePath));
  }
}
