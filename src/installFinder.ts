import path from 'path';
import fs from 'fs';
import { getDataFolders } from 'platform-folders';
import { compare, valid, coerce } from 'semver';
import vdf from 'vdf';
import Registry from 'winreg';
import { exiftool } from 'exiftool-vendored';
import { execSync } from 'child_process';
import { SatisfactoryInstall } from './satisfactoryInstall';
import {
  warn, info, error, debug,
} from './logging';

const EpicManifestsFolder = path.join(getDataFolders()[0], 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'); // TODO: other platforms
const UEInstalledManifest = path.join(getDataFolders()[0], 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'); // TODO: other platforms

interface InstallFindResult {
  installs: Array<SatisfactoryInstall>;
  invalidInstalls: Array<string>;
}

interface UEInstalledManifestEntry {
  InstallLocation: string;
  AppName: string;
  AppVersion: string;
}

interface UEInstalledManifest {
  InstallationList: Array<UEInstalledManifestEntry>;
}

function getInstallsEpicWindows(): InstallFindResult {
  let foundInstalls: Array<SatisfactoryInstall> = [];
  const invalidInstalls: Array<string> = [];
  if (fs.existsSync(EpicManifestsFolder)) {
    fs.readdirSync(EpicManifestsFolder).forEach((fileName) => {
      if (fileName.endsWith('.item')) {
        const filePath = path.join(EpicManifestsFolder, fileName);
        try {
          const jsonString = fs.readFileSync(filePath, 'utf8');
          const manifest = JSON.parse(jsonString);
          if (manifest.CatalogNamespace === 'crab') {
            try {
              const gameManifestString = fs.readFileSync(path.join(manifest.ManifestLocation, `${manifest.InstallationGuid}.mancpn`), 'utf8');
              const gameManifest = JSON.parse(gameManifestString);
              if (gameManifest.AppName === manifest.MainGameAppName
          && gameManifest.CatalogItemId === manifest.CatalogItemId
          && gameManifest.CatalogNamespace === manifest.CatalogNamespace) {
                const installWithSamePath = foundInstalls.find((install) => install.installLocation === manifest.InstallLocation);
                if (installWithSamePath) {
                  if (parseInt(manifest.AppVersionString, 10) > parseInt(installWithSamePath.version, 10)) {
                    installWithSamePath.version = manifest.AppVersionString;
                  }
                } else {
                  foundInstalls.push(new SatisfactoryInstall(
                    `${manifest.DisplayName} (Epic Games)`,
                    manifest.AppVersionString,
                    manifest.AppName.substr('Crab'.length),
                    manifest.InstallLocation,
                    `com.epicgames.launcher://apps/${manifest.MainGameAppName}?action=launch&silent=true`,
                  ));
                }
              } else {
                invalidInstalls.push(manifest.InstallLocation);
              }
            } catch (e) {
              invalidInstalls.push(manifest.InstallLocation);
            }
          }
        } catch (e) {
          info(`Found invalid manifest: ${fileName}`);
        }
      }
    });
  } else {
    debug('Epic Games Launcher is not installed');
    return { installs: [], invalidInstalls: [] };
  }
  let installedManifest: UEInstalledManifest = { InstallationList: [] };
  if (fs.existsSync(UEInstalledManifest)) {
    try {
      installedManifest = JSON.parse(fs.readFileSync(UEInstalledManifest, 'utf8'));
      foundInstalls = foundInstalls.filter((install) => installedManifest.InstallationList.some(
        (manifestInstall) => manifestInstall.InstallLocation === install.installLocation,
      )); // Filter out old .items left over by Epic
      if (foundInstalls.length === 0) {
        warn('UE manifest filtered all installs.');
      }
    } catch (e) {
      info('Invalid UE manifest. The game might appear multiple times.');
    }
  } else {
    info('Invalid UE manifest. The game might appear multiple times.');
  }
  foundInstalls.sort((a, b) => {
    const semverCmp = compare(valid(coerce(a.version)) || '0.0.0', valid(coerce(b.version)) || '0.0.0');
    if (semverCmp === 0) {
      return a.name.localeCompare(b.name);
    }
    return semverCmp;
  });
  return { installs: foundInstalls, invalidInstalls };
}

interface SteamLibraryFoldersManifest {
  LibraryFolders: {
    TimeNextStatsReport: string;
    ContentStatsID: string;
    [idx: number]: string;
  };
}

interface SteamManifest {
  AppState: {
    name: string;
    installdir: string;
    UserConfig: {
      betakey?: string;
    };
  };
}

async function getGameVersionFromExe(exePath: string): Promise<string> {
  const exif = await exiftool.read(exePath);
  return ((exif['ProductVersion'].match(/CL-(?<version>\d+)/)?.groups || { version: '0' })['version']) || '0';
}

async function getRegValue(hive: string, key: string, valueName: string): Promise<string> {
  try {
    return new Promise((resolve, reject) => {
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
    const output = execSync(`${path.join(process.env.windir || 'C:\\WINDOWS', 'system32', 'reg.exe')} QUERY "${hive}${key}" /v ${valueName}`, { encoding: 'utf-8' });
    const regex = output.split('\n')[2].trim().match(/^\s*(.*)\s+(REG_SZ|REG_MULTI_SZ|REG_EXPAND_SZ|REG_DWORD|REG_QWORD|REG_BINARY|REG_NONE)\s+(.*)$/);
    if (!regex) return '';
    return regex[3];
  }
}

async function getInstallsSteamWindows(): Promise<InstallFindResult> {
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
          'steam://rungameid/526870',
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

async function getInstallsWindows(): Promise<InstallFindResult> {
  const { installs: epicInstalls, invalidInstalls: invalidEpicInstalls } = getInstallsEpicWindows();
  const { installs: steamInstalls, invalidInstalls: invalidSteamInstalls } = await getInstallsSteamWindows();
  return { installs: epicInstalls.concat(steamInstalls), invalidInstalls: invalidEpicInstalls.concat(invalidSteamInstalls) };
}

export async function getInstalls(): Promise<InstallFindResult> {
  // TODO: other OSes
  return getInstallsWindows();
}
