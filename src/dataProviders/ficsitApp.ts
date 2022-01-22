import {
  satisfies, valid, coerce,
} from 'semver';
import { buildClientSchema, DocumentNode, IntrospectionQuery } from 'graphql';
import gql from 'graphql-tag';
import {
  ApolloClient, ApolloQueryResult, FetchPolicy, createHttpLink, ApolloLink, InMemoryCache,
} from '@apollo/client/core';
import { createPersistedQueryLink } from '@apollo/client/link/persisted-queries';
import { withScalars } from 'apollo-link-scalars';
import sha from 'sha.js';
import { DateTimeResolver } from 'graphql-scalars';
import {
  UserAgent,
} from '../utils';
import { ModNotFoundError, NetworkError } from '../errors';
import { error } from '../logging';
import schema from '../__generated__/graphql.schema.json';
import {
  FicsitAppMod, FicsitAppVersion, FicsitAppSMLVersion, FicsitAppBootstrapperVersion,
} from './types';

const API_URL = 'https://api.ficsit.app';
const GRAPHQL_API_URL = `${API_URL}/v2/query`;
const link = ApolloLink.from([
  withScalars({
    schema: buildClientSchema((schema as unknown) as IntrospectionQuery),
    typesMap: {
      Date: {
        ...DateTimeResolver,
        parseValue(value) {
          if (typeof value !== 'string' || value) {
            return DateTimeResolver.parseValue(value);
          }
          return null;
        },
        parseLiteral(value, variables) {
          if (typeof value !== 'string' || value) {
            return DateTimeResolver.parseLiteral(value, variables);
          }
          return null;
        },
        serialize(value) {
          if (value instanceof Date) {
            return value.toISOString();
          }
          return value;
        },
      },
    },
  }),
  createPersistedQueryLink({ useGETForHashedQueries: true, sha256: (...args: unknown[]) => sha('sha256').update(args.toString()).digest('hex') }),
  createHttpLink({
    uri: GRAPHQL_API_URL,
    headers: {
      'User-Agent': UserAgent,
    },
  }),
]);
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link,
});

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

export async function getModDownloadLink(modReference: string, version: string): Promise<string> {
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

export async function getModReferenceFromId(modID: string): Promise<string> {
  const res = await fiscitApiQuery<{ getMod?: FicsitAppMod }>(gql`
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
  } else if (res.data.getMod) {
    return res.data.getMod.mod_reference;
  } else {
    throw new ModNotFoundError(`${modID} not found`, modID);
  }
}

export async function getModName(modReference: string): Promise<string> {
  const res = await fiscitApiQuery<{ getModByReference?: FicsitAppMod }>(gql`
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
  } else if (res.data.getModByReference) {
    return res.data.getModByReference.name;
  } else {
    throw new ModNotFoundError(`${modReference} not found`, modReference);
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
  const MODS_PER_PAGE = 50;
  const res = await fiscitApiQuery<{ getMods: { count: number} }>(gql`
    query {
      getMods {
        count
      }
    }
  `);
  const modCount = res.data.getMods.count;
  const modPages = Math.ceil(modCount / MODS_PER_PAGE);
  const mods = (await Promise.all(Array.from({ length: modPages }).map(async (_, i) => {
    const pageMods = await fiscitApiQuery<{ getMods: { mods: Array<FicsitAppMod> } }>(gql`
      query($limit: Int!, $offset: Int!){
        getMods(filter: {
          limit: $limit,
          offset: $offset
        })
        {
          mods
          {
            id,
            mod_reference,
          }
        }
      }
    `, {
      offset: i * MODS_PER_PAGE,
      limit: MODS_PER_PAGE,
    });
    return pageMods.data.getMods.mods;
  })))
    .flat(1);
  await Promise.all(Array.from({ length: modPages })
    .map(async (_, i) => getManyModVersions(mods.slice(i * MODS_PER_PAGE, (i + 1) * MODS_PER_PAGE).map((mod) => mod.mod_reference))));
}

export async function getModVersions(modReference: string): Promise<Array<FicsitAppVersion>> {
  const res = await fiscitApiQuery<{ getModByReference?: FicsitAppMod }>(gql`
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
    throw new ModNotFoundError(`${modReference} not found`, modReference);
  }
}

export async function getModVersion(modReference: string, version: string): Promise<FicsitAppVersion> {
  const res = await fiscitApiQuery<{ getModByReference?: { version: FicsitAppVersion } }>(gql`
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
    if (res.data.getModByReference.version) {
      return res.data.getModByReference.version;
    }
    throw new ModNotFoundError(`${modReference}@${version} not found`, modReference, version);
  } else {
    throw new ModNotFoundError(`${modReference} not found`, modReference);
  }
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
