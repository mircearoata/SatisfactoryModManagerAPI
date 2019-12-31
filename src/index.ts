import { ModHandler, Mod } from './modHandler';

export async function init(): Promise<void> {
  await Promise.all([ModHandler.loadCache()]);
}

export * from './satisfactoryInstall';
export async function getCachedMods(): Promise<Array<Mod>> {
  return ModHandler.getCachedMods();
}
export { Mod, ModObject } from './modHandler';
