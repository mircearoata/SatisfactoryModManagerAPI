import path from 'path';
import fs from 'fs';
import { getDataFolders } from 'platform-folders';
import { compare, valid, coerce } from 'semver';
import { SatisfactoryInstall } from './satisfactoryInstall';
import { warn, info } from './logging';

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

function getInstallsEpic(): InstallFindResult {
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
                    manifest.InstallLocation,
                    `com.epicgames.launcher://apps/${manifest.MainGameAppName}?action=launch&silent=true`,
                  ));
                }
              } else {
                invalidInstalls.push(manifest.InstallLocation);
                warn(`Epic install info points to invalid folder ${manifest.InstallLocation}. If you moved your install to an external drive, try verifying the game in Epic and restarting your PC.`);
              }
            } catch (e) {
              invalidInstalls.push(manifest.InstallLocation);
              warn(`Epic install info points to invalid folder ${manifest.InstallLocation}. If you moved your install to an external drive, try verifying the game in Epic and restarting your PC.`);
            }
          }
        } catch (e) {
          info(`Found invalid manifest: ${fileName}`);
        }
      }
    });
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

function getInstallsSteam(): InstallFindResult {
  // TODO: steam
  return { installs: [], invalidInstalls: [] };
}

function getInstallsWindows(): InstallFindResult {
  const { installs: epicInstalls, invalidInstalls: invalidEpicInstalls } = getInstallsEpic();
  const { installs: steamInstalls, invalidInstalls: invalidSteamInstalls } = getInstallsSteam();
  return { installs: epicInstalls.concat(steamInstalls), invalidInstalls: invalidEpicInstalls.concat(invalidSteamInstalls) };
}

export function getInstalls(): InstallFindResult {
  // TODO: other OSes
  return getInstallsWindows();
}
