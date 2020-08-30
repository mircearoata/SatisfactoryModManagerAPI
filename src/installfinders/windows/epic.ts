import path from 'path';
import fs from 'fs';
import { getDataFolders } from 'platform-folders';
import {
  warn, info, debug,
} from '../../logging';
import { SatisfactoryInstall } from '../../satisfactoryInstall';
import { InstallFindResult } from '../baseInstallFinder';

interface EpicManifest {
  FormatVersion: number;
  AppVersionString: string;
  ManifestLocation: string;
  AppName: string;
  CatalogItemId: string;
  CatalogNamespace: string;
  DisplayName: string;
  InstallationGuid: string;
  InstallLocation: string;
  MainGameAppName: string;
}

interface EpicGameManifest {
  FormatVersion: number;
  AppName: string;
  CatalogNamespace: string;
  CatalogItemId: string;
}

interface UEInstalledManifestEntry {
  InstallLocation: string;
  AppName: string;
  AppVersion: string;
}

interface UEInstalledManifest {
  InstallationList: Array<UEInstalledManifestEntry>;
}

const EpicManifestsFolder = path.join(getDataFolders()[0], 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
const UEInstalledManifest = path.join(getDataFolders()[0], 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');

export function getInstalls(): InstallFindResult {
  let foundInstalls: Array<SatisfactoryInstall> = [];
  const invalidInstalls: Array<string> = [];
  if (fs.existsSync(EpicManifestsFolder)) {
    fs.readdirSync(EpicManifestsFolder).forEach((fileName) => {
      if (fileName.endsWith('.item')) {
        const filePath = path.join(EpicManifestsFolder, fileName);
        try {
          const jsonString = fs.readFileSync(filePath, 'utf8');
          const manifest = JSON.parse(jsonString) as EpicManifest;
          if (manifest.CatalogNamespace === 'crab') {
            try {
              const gameManifestString = fs.readFileSync(path.join(manifest.ManifestLocation, `${manifest.InstallationGuid}.mancpn`), 'utf8');
              const gameManifest = JSON.parse(gameManifestString) as EpicGameManifest;
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
                    `start "" "com.epicgames.launcher://apps/${manifest.MainGameAppName}?action=launch&silent=true"`,
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
  return { installs: foundInstalls, invalidInstalls };
}
