import {
  compare, satisfies, valid, coerce,
} from 'semver';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import crossFetch from 'cross-fetch';
import { ApolloClient, ApolloQueryResult, FetchPolicy } from 'apollo-client';
import { createHttpLink } from 'apollo-link-http';
import { createPersistedQueryLink } from 'apollo-link-persisted-queries';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { ApolloLink } from 'apollo-link';
import {
  versionSatisfiesAll, UserAgent, minSMLVersion, SMLID, BootstrapperID,
} from './utils';
import { ModNotFoundError, NetworkError } from './errors';
import { error, warn } from './logging';

const API_URL = 'https://api.ficsit.app';
const GRAPHQL_API_URL = `${API_URL}/v2/query`;
const link = ApolloLink.from([
  createPersistedQueryLink({ useGETForHashedQueries: true }),
  createHttpLink({
    uri: GRAPHQL_API_URL,
    fetch: fetch || crossFetch,
    headers: {
      'User-Agent': UserAgent,
    },
  }),
]);
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link,
});

let useTempMods = false; // TODO: remove once more mods are updated so live data can be used for tests instead

/**
 * This function should be used for debugging purposes only!
 * @param enable if true enables temporary mods usage
 */
export function setUseTempMods(enable: boolean): void {
  useTempMods = enable;
  if (useTempMods) {
    warn('Enabling temporary mods. This feature should be used for debugging purposes only!');
  }
}

export function getUseTempMods(): boolean {
  return useTempMods;
}

const tempMods: Array<FicsitAppMod> = [];
const allTempModReferences: Array<string> = [];

export function setTempModReference(modID: string, mod_reference: string): void {
  const tempMod = tempMods.find((mod) => mod.id === modID);
  if (tempMod) {
    allTempModReferences.remove(tempMod.mod_reference);
    allTempModReferences.push(mod_reference);
    tempMod.mod_reference = mod_reference;
  }
}

export function addTempMod(mod: FicsitAppMod): void {
  if (useTempMods) {
    const fixedMod = mod;
    fixedMod.versions = fixedMod.versions.map((ver) => {
      const tmpVer = ver;
      tmpVer.created_at = new Date(0, 0, 0, 0, 0, 0, 0);
      return tmpVer;
    });
    if (!fixedMod.name) {
      fixedMod.name = fixedMod.id;
    }
    if (!fixedMod.mod_reference) {
      fixedMod.mod_reference = fixedMod.id;
    }
    tempMods.push(fixedMod);
    allTempModReferences.push(mod.mod_reference);
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export function addTempModVersion(version: FicsitAppVersion): void {
  if (useTempMods) {
    const tempMod = tempMods.find((mod) => mod.mod_reference === version.mod_id);
    if (tempMod) {
      const fixedVersion = version;
      fixedVersion.created_at = new Date(0, 0, 0, 0, 0, 0, 0);
      tempMod.versions.push(fixedVersion);
    }
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export function removeTempMod(modReference: string): void {
  if (useTempMods) {
    tempMods.removeWhere((mod) => mod.mod_reference === modReference);
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export function removeTempModVersion(modReference: string, version: string): void {
  if (useTempMods) {
    const mod = tempMods.find((tempMod) => tempMod.mod_reference === modReference);
    if (mod) {
      mod.versions.removeWhere((modVersion) => modVersion.version === version);
    }
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export async function fiscitApiQuery<T>(query: DocumentNode<unknown, unknown>,
  variables?: { [key: string]: unknown }, options?: { fetchPolicy: FetchPolicy }): Promise<ApolloQueryResult<T>> {
  try {
    const response = await client.query<T>({
      query,
      variables,
      fetchPolicy: options?.fetchPolicy || 'cache-first',
    });
    return response;
  } catch (e) {
    error(`Error getting data from ficsit.app: ${e.message}. Trace:\n${e.stack}`);
    throw new NetworkError('Network error. Please try again later.', e.statusCode);
  }
}

export interface FicsitAppMod {
  id: string;
  name: string;
  mod_reference: string;
  short_description: string;
  full_description: string;
  logo: string;
  source_url: string;
  views: number;
  downloads: number;
  hotness: number;
  popularity: number;
  created_at: Date;
  last_version_date: Date;
  authors: Array<FicsitAppAuthor>;
  versions: Array<FicsitAppVersion>;
}

export interface FicsitAppVersion {
  mod_id: string;
  version: string;
  sml_version: string;
  changelog: string;
  downloads: string;
  stability: 'alpha' | 'beta' | 'release';
  created_at: Date;
  link: string;
  size: number;
  hash: string;
  dependencies: FicsitAppModVersionDependency[];
}

export interface FicsitAppAuthor {
  mod_id: string;
  user: FicsitAppUser;
  role: string;
}

export interface FicsitAppUser {
  username: string;
  avatar: string;
}

export interface FicsitAppModVersionDependency {
  mod_id: string;
  condition: string;
  optional: boolean;
}

export async function getModDownloadLink(modReference: string, version: string): Promise<string> {
  if (allTempModReferences.includes(modReference)) {
    const tempMod = tempMods.find((mod) => mod.mod_reference === modReference);
    if (tempMod) {
      const tempModVersion = tempMod.versions.find((ver) => ver.version === version);
      if (tempModVersion) {
        return tempModVersion.link;
      }
    }
    throw new ModNotFoundError(`Temporary mod ${modReference}@${version} not found`, modReference, version);
  }
  const res = await fiscitApiQuery<{getModByReference: { version: { link: string } } }>(gql`
    query($modReference: ModReference!, $version: String!){
      getModByReference(modReference: $modReference)
      {
        id,
        version(version: $version)
        {
          id,
          link
        }
      }
    }
    `, { modReference, version });
  if (res.errors) {
    throw res.errors;
  } else if (res.data && res.data.getModByReference && res.data.getModByReference.version) {
    return API_URL + res.data.getModByReference.version.link;
  } else {
    throw new ModNotFoundError(`${modReference}@${version} not found`, modReference, version);
  }
}

export async function getModsCount(): Promise<number> {
  const res = await fiscitApiQuery<{ getMods: { count: number} }>(gql`
  query {
    getMods {
      count
    }
  }
  `);
  if (res.errors) {
    throw res.errors;
  } else {
    return res.data.getMods.count;
  }
}

export const MODS_PER_PAGE = 50;

export async function getAvailableMods(page: number): Promise<Array<FicsitAppMod>> {
  const res = await fiscitApiQuery<{ getMods: { mods: Array<FicsitAppMod> } }>(gql`
    query($limit: Int!, $offset: Int!){
      getMods(filter: {
        limit: $limit,
        offset: $offset
      })
      {
        mods
        {
          id,
          name,
          mod_reference,
          short_description,
          full_description,
          logo,
          views,
          downloads,
          hotness,
          popularity,
          created_at,
          last_version_date,
          authors
          {
            mod_id,
            user
            {
              id,
              username,
              avatar
            },
            role
          },
          versions
          {
            id,
            mod_id,
            version,
            sml_version,
            changelog,
            downloads,
            stability,
            created_at,
            link,
            size,
            hash,
            dependencies
            {
              mod_id,
              condition,
              optional
            }
          }
        }
      }
    }
  `, {
    offset: page * MODS_PER_PAGE,
    limit: MODS_PER_PAGE,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    const resGetMods = res.data.getMods.mods;
    if (page === 0 && useTempMods) {
      resGetMods.push(...tempMods);
    }
    return resGetMods;
  }
}

export async function getModReferenceFromId(modID: string): Promise<string> {
  const res = await fiscitApiQuery<{ getMod: FicsitAppMod }>(gql`
    query($modID: ModID!){
      getMod(modId: $modID)
      {
        id,
        mod_reference,
      }
    }
    `, {
    modID,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    const resGetMod = res.data.getMod;
    if (!resGetMod) {
      if (useTempMods) {
        const tempMod = tempMods.find((mod) => mod.id === modID);
        if (tempMod) {
          return tempMod.mod_reference;
        }
      }
      throw new ModNotFoundError(`Mod ${modID} not found`, modID);
    }
    return resGetMod.mod_reference;
  }
}

export async function getMod(modReference: string): Promise<FicsitAppMod> {
  const res = await fiscitApiQuery<{ getModByReference: FicsitAppMod }>(gql`
    query($modReference: ModReference!){
      getModByReference(modReference: $modReference)
      {
        id,
        name,
        mod_reference,
        short_description,
        full_description,
        logo,
        views,
        downloads,
        hotness,
        popularity,
        created_at,
        last_version_date,
        authors
        {
          mod_id,
          user
          {
            id,
            username,
            avatar
          },
          role
        },
        versions
        {
          id,
          mod_id,
          version,
          sml_version,
          changelog,
          downloads,
          stability,
          created_at,
          link,
          size,
          hash,
          dependencies
          {
            mod_id,
            condition,
            optional
          }
        }
      }
    }
    `, {
    modReference,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    const resGetMod = res.data.getModByReference;
    if (!resGetMod) {
      if (useTempMods) {
        const tempMod = tempMods.find((mod) => mod.mod_reference === modReference);
        if (tempMod) {
          return tempMod;
        }
      }
      throw new ModNotFoundError(`Mod ${modReference} not found`, modReference);
    }
    return resGetMod;
  }
}

export async function getModName(modReference: string): Promise<string> {
  const res = await fiscitApiQuery<{ getModByReference: FicsitAppMod }>(gql`
    query($modReference: ModReference!){
      getModByReference(modReference: $modReference)
      {
        id,
        name
      }
    }
    `, {
    modReference,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    const resGetMod = res.data.getModByReference;
    if (!resGetMod) {
      if (useTempMods) {
        const tempMod = tempMods.find((mod) => mod.mod_reference === modReference);
        if (tempMod) {
          return tempMod.name;
        }
      }
      throw new ModNotFoundError(`Mod ${modReference} not found`, modReference);
    }
    return resGetMod.name;
  }
}

export async function getManyModVersions(modReferences: Array<string>): Promise<{id: string, mod_reference: string, versions: FicsitAppVersion[]}[]> {
  const res = await fiscitApiQuery<{ getMods: { mods: { id: string, mod_reference: string, versions: FicsitAppVersion[] }[] } }>(gql`
    query($references: [String!]) {
      getMods(filter: { limit: 100, references: $references }) {
        mods {
          id,
          mod_reference,
          versions(filter: {
              limit: 100
            })
          {
            id,
            mod_id,
            version,
            sml_version,
            changelog,
            downloads,
            stability,
            created_at,
            link,
            size,
            hash,
            dependencies
            {
              mod_id,
              condition,
              optional
            }
          }
        }
      }
    }
    `, {
    references: modReferences,
  }, {
    fetchPolicy: 'network-only',
  });
  if (res.errors) {
    throw res.errors;
  } else if (res.data.getMods) {
    return res.data.getMods.mods;
  } else {
    return [];
  }
}

export async function refetchVersions(): Promise<void> {
  const modCount = await getModsCount();
  const modPages = Math.ceil(modCount / MODS_PER_PAGE);
  const mods = (await Promise.all(Array.from({ length: modPages }).map(async (_, i) => getAvailableMods(i))))
    .flat(1);
  await Promise.all(Array.from({ length: modPages })
    .map(async (_, i) => getManyModVersions(mods.slice(i * MODS_PER_PAGE, (i + 1) * MODS_PER_PAGE).map((mod) => mod.mod_reference))));
}

export async function getModVersions(modReference: string): Promise<Array<FicsitAppVersion>> {
  const res = await fiscitApiQuery<{ getModByReference: FicsitAppMod }>(gql`
    query($modReference: ModReference!){
      getModByReference(modReference: $modReference)
      {
        id,
        versions(filter: {
            limit: 100
          })
        {
          id,
          mod_id,
          version,
          sml_version,
          changelog,
          downloads,
          stability,
          created_at,
          link,
          size,
          hash,
          dependencies
          {
            mod_id,
            condition,
            optional
          }
        }
      }
    }
    `, {
    modReference,
  });
  if (res.errors) {
    throw res.errors;
  } else if (res.data.getModByReference) {
    return res.data.getModByReference.versions;
  } else {
    if (useTempMods) {
      const tempMod = tempMods.find((mod) => mod.mod_reference === modReference);
      if (tempMod) {
        return tempMod.versions;
      }
    }
    throw new ModNotFoundError(`Mod ${modReference} not found`, modReference);
  }
}

export async function getModVersion(modReference: string, version: string): Promise<FicsitAppVersion> {
  const res = await fiscitApiQuery<{ getModByReference: { version: FicsitAppVersion } }>(gql`
    query($modReference: ModReference!, $version: String!){
      getModByReference(modReference: $modReference)
      {
        id,
        version(version: $version)
        {
          id,
          mod_id,
          version,
          sml_version,
          changelog,
          downloads,
          stability,
          created_at,
          link,
          size,
          hash,
          dependencies
          {
            mod_id,
            condition,
            optional
          }
        }
      }
    }
    `, {
    modReference,
    version,
  });
  if (res.errors) {
    throw res.errors;
  } else if (res.data.getModByReference) {
    if (!res.data.getModByReference.version) {
      throw new ModNotFoundError(`Mod ${modReference}@${version} not found`, modReference, version);
    }
    return res.data.getModByReference.version;
  } else {
    if (useTempMods) {
      const tempMod = tempMods.find((mod) => mod.mod_reference === modReference);
      if (tempMod) {
        const tempVer = tempMod.versions.find((ver) => ver.version === version);
        if (tempVer) {
          return tempVer;
        }
      }
    }
    throw new ModNotFoundError(`Mod ${modReference} not found`, modReference);
  }
}

export async function getModLatestVersion(modReference: string): Promise<FicsitAppVersion> {
  const versions = await getModVersions(modReference);
  versions.sort((a, b) => -compare(a.version, b.version));
  return versions[0];
}

export async function findVersionMatchingAll(modReference: string,
  versionConstraints: Array<string>): Promise<string | undefined> {
  const versions = await getModVersions(modReference);
  let finalVersion = '';
  let found = false;
  versions.forEach((modVersion) => {
    if (!found && versionSatisfiesAll(modVersion.version, versionConstraints)) {
      found = true;
      finalVersion = modVersion.version;
    }
  });
  return found ? finalVersion : undefined;
}

export interface FicsitAppSMLVersion {
  id: string;
  version: string;
  satisfactory_version: number;
  stability: 'alpha' | 'beta' | 'release';
  link: string;
  changelog: string;
  date: Date;
  bootstrap_version: string;
}

const smlVersionIDMap: {[version: string]: string} = {};

export async function getAvailableSMLVersions(): Promise<Array<FicsitAppSMLVersion>> {
  const res = await fiscitApiQuery<{ getSMLVersions: { sml_versions: Array<FicsitAppSMLVersion> } }>(gql`
    query{
      getSMLVersions(filter: {limit: 100})
      {
        sml_versions
        {
          id,
          version,
          satisfactory_version
          stability,
          link,
          changelog,
          date,
          bootstrap_version
        }
      }
    }
  `);
  if (res.errors) {
    throw res.errors;
  } else {
    // filter SML versions supported by SMManager
    const smlVersionsCompatible = res.data.getSMLVersions.sml_versions.filter((version) => satisfies(version.version, '>=2.0.0'));
    smlVersionsCompatible.forEach((ver) => {
      const validVersion = valid(coerce(ver.version));
      if (validVersion) smlVersionIDMap[validVersion] = ver.id;
    });
    return smlVersionsCompatible;
  }
}

export async function getSMLVersion(): Promise<FicsitAppSMLVersion> {
  const res = await fiscitApiQuery<{ getSMLVersion: FicsitAppSMLVersion }>(gql`
    query($versionID: SMLVersionID!){
      getSMLVersion(smlVersionID: $versionID)
      {
        id,
        version,
        satisfactory_version
        stability,
        link,
        changelog,
        date,
        bootstrap_version
      }
    }
  `);
  if (res.errors) {
    throw res.errors;
  } else {
    return res.data.getSMLVersion;
  }
}

export interface FicsitAppBootstrapperVersion {
  id: string;
  version: string;
  satisfactory_version: number;
  stability: 'alpha' | 'beta' | 'release';
  link: string;
  changelog: string;
  date: Date;
}

const bootstrapperVersionIDMap: {[version: string]: string} = {};

export async function getAvailableBootstrapperVersions(): Promise<Array<FicsitAppBootstrapperVersion>> {
  const res = await fiscitApiQuery<{ getBootstrapVersions: { bootstrap_versions: Array<FicsitAppBootstrapperVersion> } }>(gql`
    query {
      getBootstrapVersions(filter: {limit: 100})
      {
        bootstrap_versions
        {
          id,
          version,
          satisfactory_version,
          stability,
          link,
          changelog,
          date
        }
      }
    }
  `);
  if (res.errors) {
    throw res.errors;
  } else {
    res.data.getBootstrapVersions.bootstrap_versions.forEach((ver) => {
      const validVersion = valid(coerce(ver.version));
      if (validVersion) bootstrapperVersionIDMap[validVersion] = ver.id;
    });
    return res.data.getBootstrapVersions.bootstrap_versions;
  }
}

export async function getSMLVersionInfo(version: string): Promise<FicsitAppSMLVersion | undefined> {
  const validVersion = valid(coerce(version));
  if (!validVersion) throw new Error(`Invalid SML version ${version}`);
  if (!smlVersionIDMap[validVersion]) {
    return (await getAvailableSMLVersions()).find((smlVersion) => smlVersion.version === version);
  }
  const versionID = smlVersionIDMap[validVersion];
  const res = await fiscitApiQuery<{ getSMLVersion: FicsitAppSMLVersion }>(gql`
  query($versionID: SMLVersionID!){
    getSMLVersion(smlVersionID: $versionID)
    {
      id,
      version,
      satisfactory_version
      stability,
      link,
      changelog,
      date,
      bootstrap_version
    }
  }
  `, {
    versionID,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    return res.data.getSMLVersion;
  }
}

export async function getLatestSMLVersion(): Promise<FicsitAppSMLVersion> {
  const versions = await getAvailableSMLVersions();
  versions.sort((a, b) => -compare(a.version, b.version));
  return versions[0];
}

export async function getBootstrapperVersionInfo(version: string): Promise<FicsitAppBootstrapperVersion | undefined> {
  const validVersion = valid(coerce(version));
  if (!validVersion) throw new Error(`Invalid bootstrapper version ${version}`);
  if (!smlVersionIDMap[validVersion]) {
    return (await getAvailableBootstrapperVersions()).find((bootstrapperVersion) => bootstrapperVersion.version === version);
  }
  const versionID = bootstrapperVersionIDMap[validVersion];
  const res = await fiscitApiQuery<{ getSMLVersion: FicsitAppBootstrapperVersion }>(gql`
  query($versionID: BootstrapVersionID!){
    getBootstrapVersion(bootstrapVersionID: $versionID)
    {
      id,
      version,
      satisfactory_version
      stability,
      link,
      changelog,
      date,
    }
  }
  `, {
    versionID,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    return res.data.getSMLVersion;
  }
}

export async function getLatestBootstrapperVersion(): Promise<FicsitAppBootstrapperVersion> {
  const versions = await getAvailableBootstrapperVersions();
  versions.sort((a, b) => -compare(a.version, b.version));
  return versions[0];
}

export async function findAllVersionsMatchingAll(item: string, versionConstraints: Array<string>): Promise<Array<string>> {
  if (item === SMLID) {
    const smlVersions = await getAvailableSMLVersions();
    return smlVersions
      .filter((smlVersion) => satisfies(smlVersion.version, `>=${minSMLVersion}`))
      .filter((smlVersion) => versionSatisfiesAll(smlVersion.version, versionConstraints))
      .map((smlVersion) => smlVersion.version);
  }
  if (item === BootstrapperID) {
    const bootstrapperVersions = await getAvailableBootstrapperVersions();
    return bootstrapperVersions
      .filter((bootstrapperVersion) => versionSatisfiesAll(bootstrapperVersion.version, versionConstraints))
      .map((bootstrapperVersion) => bootstrapperVersion.version);
  }
  const versions = await getModVersions(item);
  return versions
    .filter((modVersion) => versionSatisfiesAll(modVersion.version, versionConstraints))
    .map((modVersion) => modVersion.version);
}
