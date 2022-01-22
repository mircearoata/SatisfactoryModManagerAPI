import { unique } from '../utils';
import { getCachedModVersions, getCachedMod, getCachedMods } from '../mods/modCache';
import { getCachedSMLVersions } from '../sml/smlCache';
import { getCachedBootstrapperVersions } from '../bootstrapper/bootstrapperCache';
import { ModNotFoundError } from '../errors';
import {
  FicsitAppBootstrapperVersion, FicsitAppMod, FicsitAppSMLVersion, FicsitAppVersion,
} from './types';

export async function getModName(modReference: string): Promise<string> {
  const versions = await getCachedModVersions(modReference);
  if (versions.length === 0) {
    throw new ModNotFoundError(`${modReference} not found`, modReference);
  }
  const mod = await getCachedMod(modReference, versions[0]);
  if (!mod) {
    throw new ModNotFoundError(`${modReference} not found`, modReference);
  }
  return mod.name;
}

export async function getModVersion(modReference: string, version: string): Promise<FicsitAppVersion> {
  const cachedVersion = await getCachedMod(modReference, version);
  if (!cachedVersion) {
    throw new ModNotFoundError(`${modReference}@${version} not found`, modReference, version);
  }
  return {
    mod_id: modReference,
    version: cachedVersion.version,
    sml_version: cachedVersion.dependencies ? cachedVersion.dependencies['SML'] : `^${cachedVersion.sml_version}`,
    changelog: '',
    downloads: 0,
    stability: 'release',
    created_at: new Date(),
    link: '',
    size: 0,
    hash: '',
    dependencies: [
      ...Object.entries(cachedVersion.dependencies || {}).map(([dep, ver]) => ({ mod_id: dep, condition: ver, optional: false })),
      ...Object.entries(cachedVersion.optional_dependencies || {}).map(([dep, ver]) => ({ mod_id: dep, condition: ver, optional: true })),
    ],
  };
}

export async function getModVersions(modReference: string): Promise<Array<FicsitAppVersion>> {
  const versions = await getCachedModVersions(modReference);
  if (versions.length === 0) {
    throw new ModNotFoundError(`${modReference} not found`, modReference);
  }
  return Promise.all(versions.map((ver) => getModVersion(modReference, ver)));
}

export async function getAvailableSMLVersions(): Promise<Array<FicsitAppSMLVersion>> {
  const versions = await getCachedSMLVersions();
  return versions.map((version) => ({
    id: version,
    version,
    satisfactory_version: 0,
    stability: 'release',
    link: '',
    changelog: '',
    date: new Date(),
    bootstrap_version: '',
  } as FicsitAppSMLVersion));
}

export async function getAvailableBootstrapperVersions(): Promise<Array<FicsitAppBootstrapperVersion>> {
  const versions = await getCachedBootstrapperVersions();
  return versions.map((version) => ({
    id: version,
    version,
    satisfactory_version: 0,
    stability: 'release',
    link: '',
    changelog: '',
    date: new Date(),
  } as FicsitAppBootstrapperVersion));
}

export async function getSMLVersionInfo(version: string): Promise<FicsitAppSMLVersion | undefined> {
  return (await getAvailableSMLVersions()).find((v) => v.version === version);
}

export async function getBootstrapperVersionInfo(version: string): Promise<FicsitAppBootstrapperVersion | undefined> {
  return (await getAvailableBootstrapperVersions()).find((v) => v.version === version);
}

export async function getOfflineMods(): Promise<Array<FicsitAppMod>> {
  const mods = (await getCachedMods()).map((mod) => mod.mod_reference).filter(unique);
  return Promise.all(mods.map(async (modReference) => ({
    id: modReference,
    name: await getModName(modReference),
    mod_reference: modReference,
    short_description: '',
    full_description: '',
    logo: '',
    source_url: '',
    views: 0,
    downloads: 0,
    hotness: 0,
    popularity: 0,
    created_at: new Date(),
    last_version_date: new Date(),
    authors: [],
    versions: await getModVersions(modReference),
  } as FicsitAppMod)));
}
