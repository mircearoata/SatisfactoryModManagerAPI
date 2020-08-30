import path from 'path';
import fs from 'fs';
import vdf from 'vdf';
import { exiftool } from 'exiftool-vendored';
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

interface UserConfig {
  UserLocalConfigStore: {
    Software: {
      Valve: {
        Steam: {
          apps: {
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
      const libraryfolders = Object.entries(libraryfoldersManifest.LibraryFolders).filter(([key]) => /^\d+$/.test(key)).map((entry) => entry[1]);
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
            'flatpak run com.valvesoftware.Steam steam://rungameid/526870',
          ));
          fs.readdirSync(path.join(STEAM_DATA_LOCATION, 'userdata')).forEach((user) => {
            try {
              const configFilePath = path.join(STEAM_DATA_LOCATION, 'userdata', user, 'config', 'localconfig.vdf');
              const configFile = vdf.parse(fs.readFileSync(configFilePath, 'utf8')) as UserConfig;
              let launchOptions = configFile.UserLocalConfigStore.Software.Valve.Steam.apps['526870'].LaunchOptions;
              if (launchOptions) {
                const wineDllOverrides = (/WINEDLLOVERRIDES=\\"(.*?)\\"/g).exec(launchOptions);
                if (!wineDllOverrides) {
                  launchOptions = `WINEDLLOVERRIDES=\\"msdia140.dll,xinput1_3.dll=n,b\\" ${launchOptions}`;
                } else {
                  const newWineDllOverrides = `WINEDLLOVERRIDES=\\"${wineDllOverrides[1]};msdia140.dll,xinput1_3.dll=n,b\\"`;
                  launchOptions = launchOptions.replace(wineDllOverrides[0], newWineDllOverrides);
                }
              } else {
                launchOptions = 'WINEDLLOVERRIDES=\\"msdia140.dll,xinput1_3.dll=n,b\\" %command%';
              }
              configFile.UserLocalConfigStore.Software.Valve.Steam.apps['526870'].LaunchOptions = launchOptions;
              fs.writeFileSync(configFilePath, vdf.dump(configFile));
            } catch (e) {
              error(e);
            }
          });
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
