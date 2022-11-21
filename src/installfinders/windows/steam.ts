import path from 'path';
import fs from 'fs';
import vdf from 'vdf';
import Registry from 'winreg';
import { execSync } from 'child_process';
import { SatisfactoryInstall } from '../../satisfactoryInstall';
import {
  error, debug, info, warn,
} from '../../logging';
import { InstallFindResult } from '../baseInstallFinder';

interface LibraryFolders {
  TimeNextStatsReport: string;
  ContentStatsID: string;
  [idx: number]: string | {
    path: string;
  };
}

interface SteamLibraryFoldersManifest {
  LibraryFolders?: LibraryFolders;
  libraryfolders?: LibraryFolders;
}

interface SteamManifest {
  AppState?: {
    name: string;
    installdir: string;
    UserConfig: {
      betakey?: string;
      BetaKey?: string;
    };
  };
}

interface VersionFile {
  MajorVersion: number;
  MinorVersion: number;
  PatchVersion: number;
  Changelist: number;
  CompatibleChangelist: number;
  IsLicenseeVersion: number;
  IsPromotedBuild: number;
  BranchName: string;
  BuildId: string;
}

async function getRegValue(hive: string, key: string, valueName: string): Promise<string | undefined> {
  try {
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
  } catch (e) {
    error(`Could not get reg value of ${hive}\\${key}\\${valueName}`);
    return undefined;
  }
}

export async function getInstalls(): Promise<InstallFindResult> {
  try {
    const steamPath = path.dirname((await getRegValue(Registry.HKCU, '\\Software\\Valve\\Steam', 'SteamExe')) || 'C:\\Program Files (x86)\\Steam\\steam.exe');
    const steamAppsPath = path.join(steamPath, 'steamapps');
    const libraryfoldersManifest = vdf.parse(fs.readFileSync(path.join(steamAppsPath, 'libraryfolders.vdf'), 'utf8')) as SteamLibraryFoldersManifest;
    const libraryFolders = libraryfoldersManifest.LibraryFolders || libraryfoldersManifest.libraryfolders;
    if (!libraryFolders) {
      warn('Steam libraryfolders.vdf does not contain the LibraryFolders key. Cannot check for Steam installs of the game');
      return { installs: [], invalidInstalls: [] };
    }
    const libraryfolders = Object.entries(libraryFolders).filter(([key]) => /^\d+$/.test(key)).map((entry) => (typeof entry[1] === 'string' ? entry[1] : entry[1].path));
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
        const gameExe = path.join(fullInstallPath, 'FactoryGame.exe');
        if (!fs.existsSync(gameExe)) {
          invalidInstalls.push(fullInstallPath);
          return;
        }
        // The Steam manifest does not give game build number, so we have to get it from here. Will this file always contain the game build number and not the engine one?
        const versionFilePath = path.join(fullInstallPath, 'Engine', 'Binaries', 'Win64', 'FactoryGame-Win64-Shipping.version');
        if (!fs.existsSync(versionFilePath)) {
          invalidInstalls.push(fullInstallPath);
          return;
        }
        const versionFile = JSON.parse(fs.readFileSync(versionFilePath, 'utf8')) as VersionFile;
        const gameVersion = versionFile.BuildId;
        const betaKey = manifest.AppState.UserConfig.betakey || manifest.AppState.UserConfig.BetaKey;
        installs.push(new SatisfactoryInstall(
          `${manifest.AppState.name} ${betaKey?.toLowerCase() === 'experimental' ? 'Experimental' : 'Early Access'} (Steam)`,
          gameVersion,
          betaKey || 'EA',
          fullInstallPath,
          'start "" "steam://rungameid/526870"',
        ));
      }
    }));
    return { installs, invalidInstalls };
  } catch (e) {
    if ((e as Error).message.includes('unable to find')) {
      debug('Steam is not installed');
    } else {
      error(e);
    }
    return { installs: [], invalidInstalls: [] };
  }
}
