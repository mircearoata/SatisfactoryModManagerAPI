import { valid } from 'semver';
import StreamZip from 'node-stream-zip';
import path from 'path';
import { InvalidModFileError } from './errors';
import { MOD_EXTENSIONS } from './utils';
import { UPlugin } from './uplugin';

export interface Mod {
  mod_id: string;
  mod_reference: string;
  name: string;
  version: string;
  description: string;
  authors: Array<string>;
  objects: Array<ModObject>;
  dependencies?: { [modReference: string]: string };
  optional_dependencies?: { [modReference: string]: string };
  sml_version?: string;
}

export interface ModObject {
  path: string;
  type: string;
}

export function getModFromUPlugin(mod_reference: string, uplugin: UPlugin): Mod {
  const mod = {
    mod_id: mod_reference,
    mod_reference,
    name: uplugin.FriendlyName,
    version: uplugin.SemVersion || valid(uplugin.VersionName) || `${uplugin.Version}.0.0`,
    description: uplugin.Description,
    authors: [...(uplugin.CreatedBy?.split(',').map((author) => author.trim()) || []), uplugin.CreatedByURL?.trim()].filter((str) => str && str.length > 0),
    objects: [],
    dependencies: Object.assign({}, ...(uplugin.Plugins?.filter((depPlugin) => !depPlugin.bOptional).map((depPlugin) => ({ [depPlugin.Name]: depPlugin.SemVersion || '*' })) || [])),
    optional_dependencies: Object.assign({}, ...(uplugin.Plugins?.filter((depPlugin) => depPlugin.bOptional).map((depPlugin) => ({ [depPlugin.Name]: depPlugin.SemVersion || '*' })) || [])),
  } as Mod;
  return mod;
}

export async function getModFromFile(modPath: string): Promise<Mod | undefined> {
  if (MOD_EXTENSIONS.includes(path.extname(modPath))) {
    const zipData = new StreamZip({ file: modPath });
    await new Promise((resolve, reject) => { zipData.on('ready', resolve); zipData.on('error', (e) => { zipData.close(); reject(e); }); });
    if (zipData.entry('data.json')) {
      // SML 2.x
      const mod = JSON.parse(zipData.entryDataSync('data.json').toString('utf8')) as Mod;
      zipData.close();
      if (!mod.mod_reference) {
        return undefined;
      }
      return mod;
    }
    // SML 3.x
    const uplugin = Object.entries(zipData.entries()).find(([name]) => name.endsWith('.uplugin'));
    if (uplugin) {
      const upluginContent = JSON.parse(zipData.entryDataSync(uplugin[0]).toString('utf8')) as UPlugin;
      zipData.close();
      return getModFromUPlugin(path.basename(uplugin[0], '.uplugin'), upluginContent);
    }
    zipData.close();
  }
  throw new InvalidModFileError(`Invalid mod file ${modPath}. Extension is ${path.extname(modPath)}, required ${MOD_EXTENSIONS.join(', ')}`);
}
