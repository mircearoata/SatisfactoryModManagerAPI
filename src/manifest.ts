import fs from 'fs';
import _ from 'lodash';
import {
  debug,
} from './logging';
import {
  getModReferenceFromId, existsOnFicsitApp,
} from './ficsitApp';
import { ModNotFoundError } from './errors';

export interface ManifestItem {
  id: string;
  version?: string;
}

export interface Manifest {
  manifestVersion: ManifestVersion;
  items: Array<ManifestItem>;
}

export enum ManifestVersion {
  // pre 1.1.3, unversioned
  AddedManifestVersions, // Fixed typo in upgraded manifests
  RemovedGameVersion, // Removed Satisfactory version from manifest
  LatestPlusOne,
  Latest = LatestPlusOne - 1
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkUpgradeManifest(manifest: any): Manifest {
  const upgradedManifest = { manifestVersion: ManifestVersion.Latest, items: manifest.items } as Manifest;
  if (manifest.manifestVersion) {
    // Nothing here yet
  } else if (manifest.item) {
    upgradedManifest.items = manifest.item;
  } else if (manifest.items) {
    upgradedManifest.items = manifest.items;
  }
  return upgradedManifest;
}

export async function mutateManifest(currentManifest: Manifest,
  install: Array<ManifestItem>, uninstall: Array<string>, update: Array<string>): Promise<Manifest> {
  const newManifest = _.cloneDeep(currentManifest);

  // Install / uninstall / update (remove set version) items
  uninstall.forEach((item) => {
    newManifest.items.removeWhere((manifestItem) => manifestItem.id === item);
  });
  install.forEach((item) => {
    const existingItem = newManifest.items.find((manifestItem) => manifestItem.id === item.id);
    if (!existingItem) {
      newManifest.items.push(item);
    } else {
      existingItem.version = item.version;
    }
  });
  update.forEach((item) => {
    const existingItem = newManifest.items.find((manifestItem) => manifestItem.id === item);
    if (existingItem) {
      delete existingItem.version;
    }
  });

  // Convert items from mod ID to mod reference
  await Promise.all(newManifest.items.map(async (item, idx) => {
    const isOnFicsitApp = await existsOnFicsitApp(item.id);
    if (!isOnFicsitApp) {
      try {
        const modReference = await getModReferenceFromId(item.id);
        newManifest.items[idx].id = modReference;
        debug(`Converted mod ${modReference} from mod ID to mod reference in manifest`);
      } catch (e) {
        if (!(e instanceof ModNotFoundError)) {
          throw e;
        }
      }
    }
  }));

  // Remove mods that were deleted from ficsit.app
  await newManifest.items.removeWhereAsync(async (item) => !(await existsOnFicsitApp(item.id)));

  return newManifest;
}

export function readManifest(filePath: string): Manifest {
  try {
    return checkUpgradeManifest(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (e) {
    return {
      manifestVersion: ManifestVersion.Latest,
      items: [],
    };
  }
}

export function writeManifest(filePath: string, manifest: Manifest): void {
  fs.writeFileSync(filePath, JSON.stringify(manifest));
}
