import { clearModCache, removeUnusedModCache } from './mods/modCache';
import { clearSMLCache, removeUnusedSMLCache } from './sml/smlCache';
import { clearBootstrapperCache, removeUnusedBootstrapperCache } from './bootstrapper/bootstrapperCache';

export {
  SatisfactoryInstall,
  getProfiles,
  createProfile,
  deleteProfile,
  renameProfile,
  getProfileFolderPath,
} from './satisfactoryInstall';
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
  getAvailableMods, getMod, getModName, getModVersions, getModLatestVersion, getModsCount, MODS_PER_PAGE,
  getAvailableSMLVersions, getLatestSMLVersion, getAvailableBootstrapperVersions, getLatestBootstrapperVersion,
  FicsitAppMod, FicsitAppVersion, FicsitAppAuthor, FicsitAppUser, FicsitAppSMLVersion,
} from './ficsitApp';
export { } from './manifest';
export * from './errors';
export {
  getLogFilePath, debug, info, warn, error,
} from './logging';
export {
  setDebug, toggleDebug, isDebug,
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
