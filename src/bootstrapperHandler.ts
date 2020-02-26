import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import {
  downloadFile,
} from './utils';
import { ModNotFoundError } from './errors';

const bootstrapperVersionNative = bindings('bootstrapperVersion');

export const bootstrapperModID = 'bootstrapper';

export const bootstrapperRelativePath = path.join('FactoryGame', 'Binaries', 'Win64', 'xinput1_3.dll'); // TODO: support other platforms
export const bootstrapperDIARelativePath = path.join('FactoryGame', 'Binaries', 'Win64', 'msdia140.dll'); // TODO: support other platforms

export function getBootstrapperDownloadLink(version: string): string {
  return `https://github.com/Archengius/SatisfactoryModBootstrapper/releases/download/${version}/xinput1_3.dll`; // TODO: Will it move to the org?
}

export function getBootstrapperDIADownloadLink(version: string): string {
  return `https://github.com/Archengius/SatisfactoryModBootstrapper/releases/download/${version}/msdia140.dll`; // TODO: Will it move to the org?
}

export function getBootstrapperVersion(satisfactoryPath: string): string | undefined {
  return bootstrapperVersionNative.getBootstrapperVersion(satisfactoryPath);
}

export async function installBootstrapper(version: string, satisfactoryPath: string): Promise<void> {
  if (!getBootstrapperVersion(satisfactoryPath)) {
    const bootstrapperDownloadLink = getBootstrapperDownloadLink(version);
    const bootstrapperDIADownloadLink = getBootstrapperDIADownloadLink(version);
    try {
      await downloadFile(bootstrapperDownloadLink,
        path.join(satisfactoryPath, bootstrapperRelativePath));
      await downloadFile(bootstrapperDIADownloadLink,
        path.join(satisfactoryPath, bootstrapperDIARelativePath));
    } catch (e) {
      if (e.statusCode === 404) {
        if (version.startsWith('v')) {
          throw new ModNotFoundError(`Bootstrapper version ${version.substr(1)} not found`);
        }
        await installBootstrapper(`v${version}`, satisfactoryPath);
      } else {
        throw e;
      }
    }
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
