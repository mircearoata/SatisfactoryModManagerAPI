import path from 'path';
import fs from 'fs';
import vdf from 'vdf';
import { exiftool } from 'exiftool-vendored';
import { SatisfactoryInstall } from '../../satisfactoryInstall';
import {
  error, debug, info, warn,
} from '../../logging';
import { InstallFindResult } from '../baseInstallFinder';

interface SteamLibraryFoldersManifest {
  LibraryFolders?: {
    TimeNextStatsReport: string;
    ContentStatsID: string;
    [idx: number]: string | {
      path: string;
    };
  };
  libraryfolders?: {
    TimeNextStatsReport: string;
    ContentStatsID: string;
    [idx: number]: string | {
      path: string;
    };
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

async function getGameVersionFromExe(exePath: string): Promise<string> {
  const exif = await exiftool.read(exePath);
  return ((exif['ProductVersion'].match(/CL-(?<version>\d+)/)?.groups || { version: '0' }).version) || '0';
}

const STEAM_DATA_LOCATION = `${process.env.HOME}/.var/app/com.valvesoftware.Steam/.steam/steam`;

export async function getInstalls(): Promise<InstallFindResult> {
  const installs: Array<SatisfactoryInstall> = [];
  const invalidInstalls: Array<string> = [];
  const steamAppsPath = path.join(STEAM_DATA_LOCATION, 'steamapps');
  if (fs.existsSync(steamAppsPath)) {
    try {
      const libraryfoldersManifest = vdf.parse(fs.readFileSync(path.join(steamAppsPath, 'libraryfolders.vdf'), 'utf8')) as SteamLibraryFoldersManifest;
      const libraryFolders = libraryfoldersManifest.LibraryFolders || libraryfoldersManifest.libraryfolders;
      if (!libraryFolders) {
        warn('Steam-flatpak libraryfolders.vdf does not contain the LibraryFolders key. Cannot check for Steam installs of the game');
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
          const gameVersion = await getGameVersionFromExe(gameExe);
          installs.push(new SatisfactoryInstall(
            `${manifest.AppState.name} ${manifest.AppState.UserConfig.betakey?.toLowerCase() === 'experimental' ? 'Experimental' : 'Early Access'} (Steam)`,
            gameVersion,
            manifest.AppState.UserConfig.betakey || 'EA',
            fullInstallPath,
            'flatpak run com.valvesoftware.Steam steam://rungameid/526870',
          ));
        }
      }));
    } catch (e) {
      error(e);
    }
  } else {
    debug('Steam-flatpak is not installed');
  }
  exiftool.end();
  return { installs, invalidInstalls };
}
