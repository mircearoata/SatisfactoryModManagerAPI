import { ModHandler, Mod } from './modHandler';

export async function getCachedMods(): Promise<Array<Mod>> {
  return ModHandler.getCachedMods();
}

export * from './satisfactoryInstall';
export { Mod, ModObject } from './modHandler';
export { getAvailableMods } from './ficsitApp';
