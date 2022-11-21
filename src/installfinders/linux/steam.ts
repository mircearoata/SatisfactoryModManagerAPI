import path from 'path';
import fs from 'fs';
import vdf from 'vdf';
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

interface UserConfig {
  UserLocalConfigStore: {
    Software: {
      Valve: {
        Steam: {
          apps: {
            [game: string]: {
              LaunchOptions?: string,
            }
          },
          Apps: {
            [game: string]: {
              LaunchOptions?: string,
            }
          }
        }
      }
    }
  }
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

const STEAM_DATA_LOCATION = `${process.env.HOME}/.steam/steam`;

export async function getInstalls(): Promise<InstallFindResult> {
  const installs: Array<SatisfactoryInstall> = [];
  const invalidInstalls: Array<string> = [];
  const steamAppsPath = path.join(STEAM_DATA_LOCATION, 'steamapps');
  if (fs.existsSync(steamAppsPath)) {
    try {
      const libraryfoldersManifest = vdf.parse(fs.readFileSync(path.join(steamAppsPath, 'libraryfolders.vdf'), 'utf8')) as SteamLibraryFoldersManifest;
      const libraryFolders = libraryfoldersManifest.LibraryFolders || libraryfoldersManifest.libraryfolders;
      if (!libraryFolders) {
        warn('Steam libraryfolders.vdf does not contain the LibraryFolders key. Cannot check for Steam installs of the game');
        return { installs: [], invalidInstalls: [] };
      }
      const libraryfolders = Object.entries(libraryFolders).filter(([key]) => /^\d+$/.test(key)).map((entry) => (typeof entry[1] === 'string' ? entry[1] : entry[1].path));
      libraryfolders.push(STEAM_DATA_LOCATION);
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
            'steam steam://rungameid/526870',
          ));
        }
      }));
    } catch (e) {
      error(e);
    }
  } else {
    debug('Steam is not installed');
  }
  return { installs, invalidInstalls };
}
