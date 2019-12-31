import { ModHandler, Mod } from './modHandler';

export * from './satisfactoryInstall';
export async function getCachedMods(): Promise<Array<Mod>> {
  return ModHandler.getCachedMods();
}
export { Mod, ModObject } from './modHandler';
