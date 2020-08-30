import { SatisfactoryInstall } from '../satisfactoryInstall';

export interface InstallFindResult {
  installs: Array<SatisfactoryInstall>;
  invalidInstalls: Array<string>;
}

export function concatInstallFindResult(...items: InstallFindResult[]): InstallFindResult {
  return {
    installs: items.map((item) => item.installs).flat(),
    invalidInstalls: items.map((item) => item.invalidInstalls).flat(),
  };
}
