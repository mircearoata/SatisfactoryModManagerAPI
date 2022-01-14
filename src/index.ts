import { clearOutdatedCache as clearOutdatedCacheFiles } from './utils';
import { getCachedMods } from './modHandler';

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
  Mod, ModObject,
  loadCache, getCachedModVersions, getCachedMod, getCachedMods,
} from './modHandler';
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
  clearCache, setDebug, toggleDebug, isDebug,
  setTimeoutEnabled,
  addDownloadProgressCallback,
  validAndGreater,
} from './utils';

export async function clearOutdatedCache(): Promise<void> {
  clearOutdatedCacheFiles();
  await getCachedMods(true);
}
