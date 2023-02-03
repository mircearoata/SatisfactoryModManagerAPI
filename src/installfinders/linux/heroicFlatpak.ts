import fs from 'fs';
import {
  debug,
} from '../../logging';
import { SatisfactoryInstall } from '../../satisfactoryInstall';
import { InstallFindResult } from '../baseInstallFinder';

interface LegendaryGame {
  app_name: string;
  base_urls: string[];
  can_run_offline: boolean;
  egl_guid: string;
  executable: string;
  install_path: string;
  install_size: number;
  is_dlc: boolean;
  launch_parameters: string;
  manifest_path: string;
  needs_verification: boolean;
  requires_ot: boolean;
  save_path: string;
  title: string;
  version: string;
}

interface LegendaryData {
  [name: string]: LegendaryGame;
}

const HEROIC_DATA_PATH = `${process.env.HOME}/.var/app/com.heroicgameslauncher.hgl/config/legendary/installed.json`;

export function getInstalls(): InstallFindResult {
  const installs: Array<SatisfactoryInstall> = [];
  const invalidInstalls: Array<string> = [];
  if (fs.existsSync(HEROIC_DATA_PATH)) {
    const heroicInstalls = JSON.parse(fs.readFileSync(HEROIC_DATA_PATH, 'utf8')) as LegendaryData;
    Object.values(heroicInstalls).forEach((legendaryGame) => {
      if (legendaryGame.app_name.includes('Crab')) {
        installs.push(new SatisfactoryInstall(
          `${legendaryGame.title} (Heroic-FlatPak)`,
          legendaryGame.version,
          legendaryGame.app_name.substring('Crab'.length),
          legendaryGame.install_path,
          `flatpak run com.heroicgameslauncher.hgl --no-gui --no-sandbox "heroic://launch/${legendaryGame.app_name}"`,
        ));
      }
    });
    return { installs, invalidInstalls };
  }
  debug('Heroic-Flatpak is not installed');

  return { installs: [], invalidInstalls: [] };
}
