import { clearModCache, removeUnusedModCache } from './mods/modCache';
import { clearSMLCache, removeUnusedSMLCache } from './sml/smlCache';
import { clearBootstrapperCache, removeUnusedBootstrapperCache } from './bootstrapper/bootstrapperCache';

export {
  SatisfactoryInstall,
} from './satisfactoryInstall';
export {
  getProfiles,
  createProfile,
  deleteProfile,
  renameProfile,
  getProfileFolderPath,
} from './profile';
export {
  readManifest,
} from './manifest';
export {
  readLockfile,
} from './lockfile';
export {
  getInstalls,
} from './installfinders';
export {
  loadCache, getCachedModVersions, getCachedMod, getCachedMods,
} from './mods/modCache';
export {
  Mod, ModObject,
} from './mods/mod';
export {
  getModName, getModVersions,
  getAvailableSMLVersions, getAvailableBootstrapperVersions,
} from './dataProviders';
export {
  getOfflineMods,
} from './dataProviders/offlineProvider';
export { } from './manifest';
export * from './errors';
export {
  addLogger, removeLogger, LogLevel,
} from './logging';
export {
  setTimeoutEnabled,
  addDownloadProgressCallback,
  validAndGreater,
} from './utils';

export function clearCache(): void {
  clearModCache();
  clearSMLCache();
  clearBootstrapperCache();
}

export async function clearOutdatedCache(): Promise<void> {
  removeUnusedModCache();
  removeUnusedSMLCache();
  removeUnusedBootstrapperCache();
}
