import { InstallFindResult, concatInstallFindResult } from '../baseInstallFinder';
import { getInstalls as getInstallsEpic } from './epic';
import { getInstalls as getInstallsSteam } from './steam';

export async function getInstalls(): Promise<InstallFindResult> {
  const epic = getInstallsEpic();
  const steam = await getInstallsSteam();
  return concatInstallFindResult(epic, steam);
}
