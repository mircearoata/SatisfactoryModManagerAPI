import path from 'path';
import fs from 'fs';
import vdf from 'vdf';
import Registry from 'winreg';
import { exiftool } from 'exiftool-vendored';
import { execSync } from 'child_process';
import { SatisfactoryInstall } from '../../satisfactoryInstall';
import {
  error, debug, info,
} from '../../logging';
import { InstallFindResult } from '../baseInstallFinder';

interface SteamLibraryFoldersManifest {
  LibraryFolders: {
    TimeNextStatsReport: string;
    ContentStatsID: string;
    [idx: number]: string;
  };
}

interface SteamManifest {
  AppState?: {
    name: string;
    installdir: string;
    UserConfig: {
      betakey?: string;
    };
  };
}

async function getGameVersionFromExe(exePath: string): Promise<string> {
  const exif = await exiftool.read(exePath);
  return ((exif['ProductVersion'].match(/CL-(?<version>\d+)/)?.groups || { version: '0' }).version) || '0';
}

async function getRegValue(hive: string, key: string, valueName: string): Promise<string> {
  try {
    return await new Promise((resolve, reject) => {
      const reg = new Registry({
        hive,
        key,
      });
      reg.get(valueName, (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result.value);
      });
    });
  } catch (e) {
    // Backup in case the other errors
    const output = execSync(`${path.join(process.env.windir || 'C:\\WINDOWS', 'system32', 'reg.exe')} QUERY "${hive}${key}" /v ${valueName}`, { encoding: 'utf8' });
    const regex = output.split('\n')[2].trim().match(/^\s*(.*)\s+(REG_SZ|REG_MULTI_SZ|REG_EXPAND_SZ|REG_DWORD|REG_QWORD|REG_BINARY|REG_NONE)\s+(.*)$/);
    if (!regex) return '';
    return regex[3];
  }
}

export async function getInstalls(): Promise<InstallFindResult> {
  try {
    const steamPath = path.dirname((await getRegValue(Registry.HKCU, '\\Software\\Valve\\Steam', 'SteamExe')));
    const steamAppsPath = path.join(steamPath, 'steamapps');
    const libraryfoldersManifest = vdf.parse(fs.readFileSync(path.join(steamAppsPath, 'libraryfolders.vdf'), 'utf8')) as SteamLibraryFoldersManifest;
    const libraryfolders = Object.entries(libraryfoldersManifest.LibraryFolders).filter(([key]) => /^\d+$/.test(key)).map((entry) => entry[1]);
    libraryfolders.push(steamPath);
    const installs: Array<SatisfactoryInstall> = [];
    const invalidInstalls: Array<string> = [];
    await Promise.all(libraryfolders.map(async (libraryFolder) => {
      const sfManifestPath = path.join(libraryFolder, 'steamapps', 'appmanifest_526870.acf');
      if (fs.existsSync(sfManifestPath)) {
        const manifest = vdf.parse(fs.readFileSync(sfManifestPath, 'utf8')) as SteamManifest;
        if (!manifest || !manifest.AppState) {
          info(`Invalid steam manifest ${sfManifestPath}`);
          return;
        }
        const fullInstallPath = path.join(libraryFolder, 'steamapps', 'common', manifest.AppState.installdir);
        const gameExe = path.join(fullInstallPath, 'FactoryGame', 'Binaries', 'Win64', 'FactoryGame-Win64-Shipping.exe');
        if (!fs.existsSync(gameExe)) {
          invalidInstalls.push(fullInstallPath);
          return;
        }
        const gameVersion = await getGameVersionFromExe(gameExe);
        installs.push(new SatisfactoryInstall(
          `${manifest.AppState.name} ${manifest.AppState.UserConfig.betakey?.toLowerCase() === 'experimental' ? 'Experimental' : 'Early Access'} (Steam)`,
          gameVersion,
          manifest.AppState.UserConfig.betakey || 'EA',
          fullInstallPath,
          'start "" "steam://rungameid/526870"',
        ));
      }
    }));
    exiftool.end();
    return { installs, invalidInstalls };
  } catch (e) {
    if ((e as Error).message.includes('unable to find')) {
      debug('Steam is not installed');
    } else {
      error(e);
    }
    exiftool.end();
    return { installs: [], invalidInstalls: [] };
  }
}
