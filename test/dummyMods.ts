import 'isomorphic-fetch';
import { FicsitAppMod } from "../src";
import { modCacheDir } from "../src/mods/modCache";
import { hashFile } from "../src/utils";
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';

const dummyMods = {
  'dummyMod0': [
    {
      SemVersion: '1.0.0',
      Plugins: [
        {
          Name: 'SML',
          SemVersion: '^3.0.0'
        },
        {
          Name: 'NonExistentDependency',
          SemVersion: '>=1.2.3'
        }
      ]
    }
  ],
  'dummyMod1': [
    {
      SemVersion: '2.0.0',
      Plugins: [
        {
          Name: 'SML',
          SemVersion: '^3.0.0'
        },
        {
          Name: 'dummyMod2',
          SemVersion: '>=1.0.0'
        }
      ]
    }
  ],
  'dummyMod2': [
    {
      SemVersion: '1.0.0',
      Plugins: [
        {
          Name: 'SML',
          SemVersion: '^3.0.0'
        }
      ]
    }
  ],
  'dummyMod3': [
    {
      SemVersion: '1.0.0',
      Plugins: [
        {
          Name: 'SML',
          SemVersion: '^2.0.0'
        }
      ]
    },
    {
      SemVersion: '2.0.0',
      Plugins: [
        {
          Name: 'SML',
          SemVersion: '^3.0.0'
        }
      ]
    },
    {
      SemVersion: '2.1.0',
      Plugins: [
        {
          Name: 'SML',
          SemVersion: '^3.0.0'
        }
      ]
    }
  ]
};

export async function createDummyMods(): Promise<Array<{mod_reference: string, version: string}>> {
  await Object.entries(dummyMods).forEachAsync(async ([mod_reference, versions]) => {
    await versions.forEachAsync(async (version) => 
      new Promise((resolve) => {
        const filePath = path.join(modCacheDir, `${mod_reference}_${version.SemVersion}.smod`);
        const zip = new JSZip();
        zip.file(`${mod_reference}.uplugin`, JSON.stringify(version));
        zip
          .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
          .pipe(fs.createWriteStream(filePath))
          .on('finish', function () {
            fs.utimesSync(filePath, new Date(2000, 0, 10, 10, 10, 10), new Date(2000, 0, 10, 10, 10, 10));
            resolve();
          });
      })
    );
  });
  return Object.entries(dummyMods).map(([mod_reference, versions]) => versions.map((ver) => ({mod_reference, version: ver.SemVersion}))).flat(1);
}

export function removeDummyMods() {
  Object.entries(dummyMods).forEach(([mod_reference, versions]) => {
    versions.forEach((version) => {
      const filePath = path.join(modCacheDir, `${mod_reference}_${version.SemVersion}.smod`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  });
}