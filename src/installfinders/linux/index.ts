import { InstallFindResult, concatInstallFindResult } from '../baseInstallFinder';
import { getInstalls as getInstallsLutrisEpic } from './lutrisEpic';
import { getInstalls as getInstallsLegendary } from './legendary';
import { getInstalls as getInstallsSteam } from './steam';
import { getInstalls as getInstallsSteamFlatpak } from './steamFlatpak';

export async function getInstalls(): Promise<InstallFindResult> {
  const lutrisEpic = getInstallsLutrisEpic();
  const legendary = getInstallsLegendary();
  const steam = await getInstallsSteam();
  const steamFlatpak = await getInstallsSteamFlatpak();
  return concatInstallFindResult(lutrisEpic, legendary, steam, steamFlatpak);
}
