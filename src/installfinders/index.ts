import { InstallFindResult } from './baseInstallFinder';
import { getInstalls as getInstallsWindows } from './windows';
import { getInstalls as getInstallsLinux } from './linux';

export async function getInstalls(): Promise<InstallFindResult> {
  if (process.platform === 'win32') {
    return getInstallsWindows();
  }
  if (process.platform === 'linux') {
    return getInstallsLinux();
  }
  return { installs: [], invalidInstalls: [] };
}
