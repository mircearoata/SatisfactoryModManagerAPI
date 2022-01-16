import fs from 'fs';
import path from 'path';
import StreamZip from 'node-stream-zip';
import {
  copyFile, MOD_EXTENSIONS, SMLID,
} from './utils';
import { error } from './logging';
import { ensureExists } from './paths';
import { SMLVersion } from './smlHandler';
import { UPlugin } from './uplugin';
import {
  getCachedModPath, verifyCachedModFile,
} from './modCache';
import { getModFromFile, getModFromUPlugin, Mod } from './mod';

const SMM_TRACKED_FILE = '.smm';

export async function installMod(modReference: string, version: string, modsDir: string, smlVersion: SMLVersion): Promise<void> {
  const modPath = getCachedModPath(modReference, version);
  if (modPath) {
    await verifyCachedModFile(modReference, version);
    if (smlVersion === SMLVersion.v2_x) {
      copyFile(modPath, modsDir);
    } else if (smlVersion === SMLVersion.v3_x) {
      // eslint-disable-next-line new-cap
      const zipData = new StreamZip.async({ file: modPath });
      const extractPath = path.join(modsDir, modReference);
      ensureExists(extractPath);
      await zipData.extract(null, extractPath);
      await zipData.close();
      fs.writeFileSync(path.join(extractPath, SMM_TRACKED_FILE), '');
    } else {
      throw new Error('Invalid smlVersion');
    }
  }
}

export async function uninstallMods(modReferences: Array<string>, modsDir: string, smlVersion: SMLVersion): Promise<void> {
  if (fs.existsSync(modsDir)) {
    if (smlVersion === SMLVersion.v2_x) {
      await Promise.all(fs.readdirSync(modsDir).map(async (file) => {
        const fullPath = path.join(modsDir, file);
        if (MOD_EXTENSIONS.includes(path.extname(fullPath))) {
          try {
            const mod = await getModFromFile(fullPath);
            if (mod && modReferences.includes(mod.mod_reference)) {
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
              }
            }
          } catch (e) {
            error(`Corrupt installed mod found ${fullPath}`);
          }
        }
      }));
    } else if (smlVersion === SMLVersion.v3_x) {
      await Promise.all(fs.readdirSync(modsDir).map(async (dir) => {
        if (dir === SMLID) return;
        const fullPath = path.join(modsDir, dir);
        const upluginPath = path.join(fullPath, `${dir}.uplugin`);
        if (fs.existsSync(upluginPath)) {
          try {
            const mod = getModFromUPlugin(dir, JSON.parse(fs.readFileSync(upluginPath, { encoding: 'utf8' })) as UPlugin);
            if (modReferences.includes(mod.mod_reference)) {
              fs.rmdirSync(fullPath, { recursive: true });
            }
          } catch (e) {
            error(`Error reading mod ${fullPath}`);
          }
        }
      }));
    } else {
      throw new Error('Invalid smlVersion');
    }
  }
}

export async function getInstalledMods(modsDir: string | undefined, smlVersion: SMLVersion): Promise<Array<Mod>> {
  if (!modsDir) {
    return [];
  }
  const installedModsPromises = new Array<Promise<Mod | undefined>>();
  if (fs.existsSync(modsDir)) {
    if (smlVersion === SMLVersion.v2_x) {
      fs.readdirSync(modsDir).forEach((file) => {
        const fullPath = path.join(modsDir, file);
        if (MOD_EXTENSIONS.includes(path.extname(fullPath))) {
          installedModsPromises.push((async () => {
            try {
              return await getModFromFile(fullPath);
            } catch (e) {
              error(`Corrupt installed mod found ${fullPath}`);
            }
            return undefined;
          })());
        }
      });
    } else if (smlVersion === SMLVersion.v3_x) {
      fs.readdirSync(modsDir).forEach((dir) => {
        if (dir === SMLID) return;
        const fullPath = path.join(modsDir, dir);
        if (!fs.existsSync(path.join(fullPath, SMM_TRACKED_FILE))) return;
        const upluginPath = path.join(fullPath, `${dir}.uplugin`);
        if (fs.existsSync(upluginPath)) {
          try {
            const mod = getModFromUPlugin(dir, JSON.parse(fs.readFileSync(upluginPath, { encoding: 'utf8' })) as UPlugin);
            installedModsPromises.push(Promise.resolve(mod));
          } catch (e) {
            error(`Error reading mod ${fullPath}`);
          }
        }
      });
    } else {
      throw new Error('Invalid smlVersion');
    }
  }
  const mods = new Array<Mod>();
  (await Promise.all(installedModsPromises)).forEach((mod) => {
    if (mod) {
      mods.push(mod);
    }
  });
  return mods;
}
