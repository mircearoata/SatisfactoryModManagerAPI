import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import {
  warn, info, debug, error,
} from '../../logging';
import { SatisfactoryInstall } from '../../satisfactoryInstall';
import { InstallFindResult } from '../baseInstallFinder';
import { setDllOverrides } from './wineHelpers';

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

interface LutrisGame {
  id: number;
  slug: string;
  name: string;
  runner: string;
  directory: string;
}

const EpicManifestsFolderRelative = path.join('Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
const UEInstalledManifestRelative = path.join('Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');

export function getInstalls(): InstallFindResult {
  const installs: Array<SatisfactoryInstall> = [];
  const invalidInstalls: Array<string> = [];
  try {
    const lutrisGames = JSON.parse(execSync('lutris -lj', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })) as LutrisGame[];
    lutrisGames.forEach((lutrisGame) => {
      if (!lutrisGame.directory) {
        debug(`Lutris game ${lutrisGame.name} has null directory.`);
        return;
      }
      const programData = path.join(lutrisGame.directory, 'drive_c', 'ProgramData');
      const EpicManifestsFolder = path.join(programData, EpicManifestsFolderRelative);
      const UEInstalledManifest = path.join(programData, UEInstalledManifestRelative);
      if (fs.existsSync(EpicManifestsFolder)) {
        let foundInstalls: Array<SatisfactoryInstall> = [];
        fs.readdirSync(EpicManifestsFolder).forEach((fileName) => {
          if (fileName.endsWith('.item')) {
            const filePath = path.join(EpicManifestsFolder, fileName);
            try {
              const jsonString = fs.readFileSync(filePath, 'utf8');
              const manifest = JSON.parse(jsonString) as EpicManifest;
              if (manifest.CatalogNamespace === 'crab') {
                const realInstallLocation = path.join(lutrisGame.directory, `drive_${manifest.InstallLocation[0].toLowerCase()}`, manifest.InstallLocation.replace(/\\/g, '/').substr(2));
                try {
                  const realManifestLocation = path.join(lutrisGame.directory, `drive_${manifest.ManifestLocation[0].toLowerCase()}`, manifest.ManifestLocation.replace(/\\/g, '/').substr(2));
                  const gameManifestString = fs.readFileSync(path.join(realManifestLocation, `${manifest.InstallationGuid}.mancpn`), 'utf8');
                  const gameManifest = JSON.parse(gameManifestString) as EpicGameManifest;
                  if (gameManifest.AppName === manifest.MainGameAppName
                  && gameManifest.CatalogItemId === manifest.CatalogItemId
                  && gameManifest.CatalogNamespace === manifest.CatalogNamespace) {
                    const installWithSamePath = foundInstalls.find((install) => install.installLocation === realInstallLocation);
                    if (installWithSamePath) {
                      if (parseInt(manifest.AppVersionString, 10) > parseInt(installWithSamePath.version, 10)) {
                        installWithSamePath.version = manifest.AppVersionString;
                      }
                    } else {
                      foundInstalls.push(new SatisfactoryInstall(
                        `${manifest.DisplayName} (Lutris - ${lutrisGame.name})`,
                        manifest.AppVersionString,
                        manifest.AppName.substr('Crab'.length),
                        realInstallLocation,
                        `lutris lutris:rungame/${lutrisGame.slug}`,
                      ));
                    }
                  } else {
                    invalidInstalls.push(realInstallLocation);
                  }
                } catch (e) {
                  invalidInstalls.push(realInstallLocation);
                }
              }
            } catch (e) {
              info(`Found invalid manifest: ${fileName}`);
            }
          }
        });
        let installedManifest: UEInstalledManifest = { InstallationList: [] };
        if (fs.existsSync(UEInstalledManifest)) {
          try {
            installedManifest = JSON.parse(fs.readFileSync(UEInstalledManifest, 'utf8'));
            if (foundInstalls.length > 0) {
              foundInstalls = foundInstalls.filter((install) => installedManifest.InstallationList.some(
                (manifestInstall) => {
                  const realManifestInstall = path.join(lutrisGame.directory, `drive_${manifestInstall.InstallLocation[0].toLowerCase()}`, manifestInstall.InstallLocation.replace(/\\/g, '/').substr(2));
                  return realManifestInstall === install.installLocation;
                },
              )); // Filter out old .items left over by Epic
              if (foundInstalls.length === 0) {
                warn('UE manifest filtered all installs.');
              }
            }
          } catch (e) {
            info('Invalid UE manifest. The game might appear multiple times.');
          }
        } else {
          info('Invalid UE manifest. The game might appear multiple times.');
        }
        foundInstalls.forEach((install) => installs.push(install));
        if (foundInstalls.length > 0) {
          setDllOverrides(lutrisGame.directory);
        }
      } else {
        debug(`Epic Games Launcher is not installed in Lutris - ${lutrisGame.name}`);
      }
    });
    return { installs, invalidInstalls };
  } catch (e) {
    error(e);
    return { installs: [], invalidInstalls: [] };
  }
}
