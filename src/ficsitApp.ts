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
