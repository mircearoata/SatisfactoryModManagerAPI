import path from 'path';
import fs from 'fs';
import bindings from 'bindings';
import { downloadFile } from './utils';

const smlVersionNative = bindings('smlVersion');

export function getSMLRelativePath(): string {
  return path.join('FactoryGame', 'Binaries', 'Win64', 'xinput1_3.dll');
  // return path.join('loaders', 'UE4-SML-Win64-Shipping.dll');
  // bootstrapper?
  // probably another handler for it
}

export async function getSMLDownloadLink(version: string): Promise<string> {
  // if (semver.satisfies(version, '<2.0.0')) {
  return `https://github.com/satisfactorymodding/SatisfactoryModLoader/releases/download/${version}/xinput1_3.dll`;
  // }
  // throw new Error('Not implemented');
}

export class SMLHandler {
  satisfactoryPath: string;
  constructor(satisfactoryPath: string) {
    this.satisfactoryPath = satisfactoryPath;
  }

  async getSMLVersion(): Promise<string | undefined> {
    return smlVersionNative.getSMLVersion(this.satisfactoryPath);
  }

  async installSML(version: string): Promise<void> {
    if (!await this.getSMLVersion()) {
      const smlDownloadLink = await getSMLDownloadLink(version);
      try {
        await downloadFile(smlDownloadLink,
          path.join(this.satisfactoryPath, getSMLRelativePath()));
      } catch (e) {
        if (version.startsWith('v')) {
          throw new Error(`SML version ${version.substr(1)} not found`);
        }
        await this.installSML(`v${version}`);
      }
    }
  }

  async uninstallSML(): Promise<void> {
    fs.unlinkSync(path.join(this.satisfactoryPath, getSMLRelativePath()));
  }
}
