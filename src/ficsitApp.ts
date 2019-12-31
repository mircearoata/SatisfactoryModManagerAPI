import request from 'request-promise-native';

const API_URL = 'https://api.ficsit.app';
const GRAPHQL_API_URL = `${API_URL}/v2/query`;

export async function fiscitApiQuery(query: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variables?: { [key: string]: any }): Promise<{ [key: string]: any }> {
  try {
    const response = JSON.parse(await request(GRAPHQL_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        query,
        variables,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    }));
    return response.data;
  } catch (e) {
    return JSON.parse(e.error);
  }
}

export async function getModDownloadLink(modID: string, version: string): Promise<string> {
  const res = await fiscitApiQuery(`
  query($modID: ModID!, $version: String!){
    getMod(modId: $modID)
    {
      version(version: $version)
      {
        link
      }
    }
  }
  `, { modID, version });
  if (res.errors) {
    throw res.errors;
  } else if (res.getMod.version) {
    return API_URL + res.getMod.version.link;
  } else {
    throw new Error(`${modID}@${version} not found`);
  }
}

export interface FicsitAppMod {
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
}

export interface FicsitAppVersion {
  mod_id: string;
  version: string;
  sml_version: string;
  changelog: string;
  downloads: string;
  stability: 'alpha' | 'beta' | 'release';
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

let lastModsFetch = new Date(0, 0, 0);
const fetchCooldown = 5 * 60 * 1000;
let cachedAvailableMods: Array<FicsitAppMod>;

export async function getAvailableMods(): Promise<Array<FicsitAppMod>> {
  if (Date.now() - lastModsFetch.getTime() > fetchCooldown) {
    const res = await fiscitApiQuery(`
    {
      getMods(filter: {
        limit: 100
      })
      {
        mods
        {
          name,
          short_description,
          full_description,
          id,
          authors
          {
            mod_id,
            user
            {
              username,
              avatar
            },
            role
          },
          versions
          {
            mod_id,
            version,
            sml_version,
            changelog,
            downloads,
            stability,
            link
          }
        }
      }
    }
    `);
    if (res.errors) {
      throw res.errors;
    } else {
      cachedAvailableMods = res.getMods.mods;
      lastModsFetch = new Date();
    }
  }
  return cachedAvailableMods;
}
