import fs from 'fs';
import { execSync } from 'child_process';
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

interface LegendaryConfig {
  [appname: string]: {
    wine_prefix?: string;
    WINEPREFIX?: string;
  }
}

const LEGENDARY_DATA_PATH = `${process.env.HOME}/.config/legendary/installed.json`;
const HEROIC_LEGENDARY_DATA_PATH = `${process.env.HOME}/.config/heroic/legendaryConfig/legendary/installed.json`;

export function getInstalls(): InstallFindResult {
  const installs: Array<SatisfactoryInstall> = [];
  const invalidInstalls: Array<string> = [];
  let DATA_PATH = '';

  if (fs.existsSync(HEROIC_LEGENDARY_DATA_PATH)) {
    DATA_PATH = HEROIC_LEGENDARY_DATA_PATH;
  } else if (fs.existsSync(LEGENDARY_DATA_PATH)) {
    DATA_PATH = LEGENDARY_DATA_PATH;
  }

  if (DATA_PATH !== '') {
    const legendaryInstalls = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as LegendaryData;
    Object.values(legendaryInstalls).forEach((legendaryGame) => {
      if (legendaryGame.app_name.includes('Crab')) {
        let canLaunch = false;
        try {
          execSync('legendary', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
          canLaunch = true;
        } catch (e) {
          // legendary executable not found
        }
        installs.push(new SatisfactoryInstall(
          `${legendaryGame.title} (Legendary)`,
          legendaryGame.version,
          legendaryGame.app_name.substr('Crab'.length),
          legendaryGame.install_path,
          canLaunch ? `legendary launch ${legendaryGame.app_name}` : undefined,
        ));
      }
    });
    return { installs, invalidInstalls };
  }
  debug('Legendary is not installed');

  return { installs: [], invalidInstalls: [] };
}
