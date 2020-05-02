import {
  compare, satisfies, valid, coerce,
} from 'semver';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import fetch from 'cross-fetch';
import { ApolloClient, ApolloQueryResult } from 'apollo-client';
import { createHttpLink } from 'apollo-link-http';
import { createPersistedQueryLink } from 'apollo-link-persisted-queries';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { ApolloLink } from 'apollo-link';
import { versionSatisfiesAll } from './utils';
import { ModNotFoundError, NetworkError } from './errors';
import { minSMLVersion, SMLModID } from './smlHandler';
import { BootstrapperModID } from './bootstrapperHandler';
import { warn, debug } from './logging';

const API_URL = 'https://api.ficsit.app';
const GRAPHQL_API_URL = `${API_URL}/v2/query`;
const link = ApolloLink.from([
  createPersistedQueryLink({ useGETForHashedQueries: true }),
  createHttpLink({
    uri: GRAPHQL_API_URL,
    fetch,
    headers: {
      'User-Agent': 'SatisfactoryModManager', // TODO: allow apps to set this
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
const allTempModIDs: Array<string> = [];

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
    tempMods.push(fixedMod);
    allTempModIDs.push(mod.id);
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export function addTempModVersion(version: FicsitAppVersion): void {
  if (useTempMods) {
    const tempMod = tempMods.find((mod) => mod.id === version.mod_id);
    if (tempMod) {
      const fixedVersion = version;
      fixedVersion.created_at = new Date(0, 0, 0, 0, 0, 0, 0);
      tempMod.versions.push(fixedVersion);
    }
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export function removeTempMod(modID: string): void {
  if (useTempMods) {
    tempMods.removeWhere((mod) => mod.id === modID);
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export function removeTempModVersion(modID: string, version: string): void {
  if (useTempMods) {
    const mod = tempMods.find((tempMod) => tempMod.id === modID);
    if (mod) {
      mod.versions.removeWhere((modVersion) => modVersion.version === version);
    }
  } else {
    warn('Temporary mods are only available in debug mode');
  }
}

export async function fiscitApiQuery<T>(query: DocumentNode<unknown, unknown>,
  variables?: { [key: string]: unknown }): Promise<ApolloQueryResult<T>> {
  try {
    const response = await client.query<T>({
      query,
      variables,
      fetchPolicy: 'cache-first',
    });
    return response;
  } catch (e) {
    debug(`Error getting data from ficsit.app: ${e.message}. Trace:\n${e.stack}`);
    throw new NetworkError('Network error. Please try again later.', e.statusCode);
  }
}

export interface FicsitAppMod {
  id: string;
  name: string;
  short_description: string;
  full_description: string;
  logo: string;
  source_url: string;
  views: number;
  downloads: number;
  hotness: number;
  popularity: number;
  last_version_date: Date;
  authors: Array<FicsitAppAuthor>;
  versions: Array<FicsitAppVersion>;
  version: FicsitAppVersion;
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

export async function getModDownloadLink(modID: string, version: string): Promise<string> {
  if (allTempModIDs.includes(modID)) {
    const tempMod = tempMods.find((mod) => mod.id === modID);
    if (tempMod) {
      const tempModVersion = tempMod.versions.find((ver) => ver.version === version);
      if (tempModVersion) {
        return tempModVersion.link;
      }
    }
    throw new ModNotFoundError(`Temporary mod ${modID}@${version} not found`);
  }
  const res = await fiscitApiQuery<{getMod: { version: { link: string } } }>(gql`
    query($modID: ModID!, $version: String!){
      getMod(modId: $modID)
      {
        id,
        version(version: $version)
        {
          id,
          link
        }
      }
    }
    `, { modID, version });
  if (res.errors) {
    throw res.errors;
  } else if (res.data && res.data.getMod && res.data.getMod.version) {
    return API_URL + res.data.getMod.version.link;
  } else {
    throw new ModNotFoundError(`${modID}@${version} not found`);
  }
}

const MODS_PER_PAGE = 20;

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
          short_description,
          full_description,
          logo,
          views,
          downloads,
          hotness,
          popularity,
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
            link
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

export async function getMod(modID: string): Promise<FicsitAppMod> {
  const res = await fiscitApiQuery<{ getMod: FicsitAppMod }>(gql`
    query($modID: ModID!){
      getMod(modId: $modID)
      {
        id,
        name,
        short_description,
        full_description,
        logo,
        downloads,
        hotness,
        popularity,
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
          link
        }
      }
    }
    `, {
    modID,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    const resGetMod = res.data.getMod;
    if (resGetMod === null) {
      if (useTempMods) {
        const tempMod = tempMods.find((mod) => mod.id === modID);
        if (tempMod) {
          return tempMod;
        }
      }
      throw new ModNotFoundError(`Mod ${modID} not found`);
    }
    return resGetMod;
  }
}

export async function getModName(modID: string): Promise<string> {
  const res = await fiscitApiQuery<{ getMod: FicsitAppMod }>(gql`
    query($modID: ModID!){
      getMod(modId: $modID)
      {
        id,
        name
      }
    }
    `, {
    modID,
  });
  if (res.errors) {
    throw res.errors;
  } else {
    const resGetMod = res.data.getMod;
    if (resGetMod === null) {
      if (useTempMods) {
        const tempMod = tempMods.find((mod) => mod.id === modID);
        if (tempMod) {
          return tempMod.name;
        }
      }
      throw new ModNotFoundError(`Mod ${modID} not found`);
    }
    return resGetMod.name;
  }
}

export async function getModVersions(modID: string): Promise<Array<FicsitAppVersion>> {
  const res = await fiscitApiQuery<{ getMod: FicsitAppMod }>(gql`
    query($modID: ModID!){
      getMod(modId: $modID)
      {
        id,
        name,
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
          link
        }
      }
    }
    `, {
    modID,
  });
  if (res.errors) {
    throw res.errors;
  } else if (res.data.getMod) {
    return res.data.getMod.versions;
  } else {
    if (useTempMods) {
      const tempMod = tempMods.find((mod) => mod.id === modID);
      if (tempMod) {
        return tempMod.versions;
      }
    }
    throw new ModNotFoundError(`Mod ${modID} not found`);
  }
}

export async function getModVersion(modID: string, version: string): Promise<FicsitAppVersion> {
  const res = await fiscitApiQuery<{ getMod: { version: FicsitAppVersion } }>(gql`
    query($modID: ModID!, $version: String!){
      getMod(modId: $modID)
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
          link
        }
      }
    }
    `, {
    modID,
    version,
  });
  if (res.errors) {
    throw res.errors;
  } else if (res.data.getMod) {
    if (!res.data.getMod.version) {
      throw new ModNotFoundError(`Mod ${modID}@${version} not found`);
    }
    return res.data.getMod.version;
  } else {
    if (useTempMods) {
      const tempMod = tempMods.find((mod) => mod.id === modID);
      if (tempMod) {
        const tempVer = tempMod.versions.find((ver) => ver.version === version);
        if (tempVer) {
          return tempVer;
        }
      }
    }
    throw new ModNotFoundError(`Mod ${modID} not found`);
  }
}

export async function getModLatestVersion(modID: string): Promise<FicsitAppVersion> {
  const versions = await getModVersions(modID);
  versions.sort((a, b) => -compare(a.version, b.version));
  return versions[0];
}

export async function findVersionMatchingAll(modID: string,
  versionConstraints: Array<string>): Promise<string | undefined> {
  const modInfo = await getMod(modID);
  let finalVersion = '';
  let found = false;
  modInfo.versions.forEach((modVersion) => {
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
    {
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

export async function findAllVersionsMatchingAll(modID: string, versionConstraints: Array<string>): Promise<Array<string>> {
  if (modID === SMLModID) {
    const smlVersions = await getAvailableSMLVersions();
    return smlVersions
      .filter((smlVersion) => satisfies(smlVersion.version, `>=${minSMLVersion}`))
      .filter((smlVersion) => versionSatisfiesAll(smlVersion.version, versionConstraints))
      .map((smlVersion) => smlVersion.version);
  }
  if (modID === BootstrapperModID) {
    const bootstrapperVersions = await getAvailableBootstrapperVersions();
    return bootstrapperVersions
      .filter((bootstrapperVersion) => versionSatisfiesAll(bootstrapperVersion.version, versionConstraints))
      .map((bootstrapperVersion) => bootstrapperVersion.version);
  }
  const modInfo = await getMod(modID);
  return modInfo.versions
    .filter((modVersion) => versionSatisfiesAll(modVersion.version, versionConstraints))
    .map((modVersion) => modVersion.version);
}
