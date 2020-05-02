import fs from 'fs';
import { valid, coerce } from 'semver';
import {
  mapObject, unique,
} from './utils';
import {
  LockfileGraph, Lockfile, LockfileGraphNode, ItemVersionList,
} from './lockfile';
import { info, debug } from './logging';
import { SMLID } from './smlHandler';
import { BootstrapperID } from './bootstrapperHandler';
import {
  getSMLVersionInfo, getBootstrapperVersionInfo, getModVersion, getModName, getModReferenceFromId,
} from './ficsitApp';
import { ModNotFoundError, ValidationError } from './errors';

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

async function versionExistsOnFicsitApp(id: string, version: string): Promise<boolean> {
  if (id === SMLID) {
    return !!(await getSMLVersionInfo(version));
  }
  if (id === BootstrapperID) {
    return !!(await getBootstrapperVersionInfo(version));
  }
  if (id === 'SatisfactoryGame') {
    return true;
  }
  try {
    return !!await getModVersion(id, version);
  } catch (e) {
    if (e instanceof ModNotFoundError) {
      return false;
    }
    throw e;
  }
}

async function itemExistsOnFicsitApp(id: string): Promise<boolean> {
  if (id === SMLID || id === BootstrapperID) {
    return true;
  }
  try {
    return !!await getModName(id);
  } catch (e) {
    if (e instanceof ModNotFoundError) {
      return false;
    }
    throw e;
  }
}

export async function mutateManifest(original: {manifest: Manifest; lockfile: Lockfile}, satisfactoryVersion: string,
  install: Array<ManifestItem>, uninstall: Array<string>, update: Array<string>): Promise<{manifest: Manifest; lockfile: Lockfile}> {
  const manifest: Manifest = { manifestVersion: original.manifest.manifestVersion, items: [] };
  original.manifest.items.forEach((item) => manifest.items.push({ id: item.id, version: item.version }));
  uninstall.forEach((item) => {
    manifest.items.removeWhere((manifestItem) => manifestItem.id === item);
  });
  install.forEach((item) => {
    const existingItem = manifest.items.find((manifestItem) => manifestItem.id === item.id);
    if (!existingItem) {
      manifest.items.push(item);
    } else {
      existingItem.version = item.version;
    }
  });
  update.forEach((item) => {
    const existingItem = manifest.items.find((manifestItem) => manifestItem.id === item);
    if (existingItem) {
      delete existingItem.version;
    }
  });

  await manifest.items.forEachAsync(async (item, idx) => {
    const isOnFicsitApp = await itemExistsOnFicsitApp(item.id);
    if (!isOnFicsitApp) {
      try {
        const modReference = await getModReferenceFromId(item.id);
        manifest.items[idx].id = modReference;
        debug(`Converted mod ${modReference} from mod ID to mod reference in manifest`);
      } catch (e) {
        if (!(e instanceof ModNotFoundError)) {
          throw e;
        }
      }
    }
  });

  manifest.items.removeWhereAsync(async (item) => !(await itemExistsOnFicsitApp(item.id)));

  const graph = new LockfileGraph();
  await graph.fromLockfile(original.lockfile);

  await graph.nodes.forEachAsync(async (node, idx) => {
    const isOnFicsitApp = await versionExistsOnFicsitApp(node.id, node.version);
    if (!isOnFicsitApp) {
      try {
        const modReference = await getModReferenceFromId(node.id);
        graph.nodes[idx].id = modReference;
        debug(`Converted mod ${modReference} from mod ID to mod reference in lockfile`);
      } catch (e) {
        if (!(e instanceof ModNotFoundError)) {
          throw e;
        }
      }
    }
  });

  graph.roots().forEach((root) => {
    if (!manifest.items.some((manifestItem) => manifestItem.id === root.id)) {
      graph.remove(root);
    }
  });
  graph.nodes.forEach((node) => {
    if (update.includes(node.id)) {
      graph.remove(node);
    }
  });

  const modsRemovedFromFicsitApp = await graph.nodes.filterAsync(async (node) => !(await versionExistsOnFicsitApp(node.id, node.version)));
  modsRemovedFromFicsitApp.forEach((node) => {
    graph.nodes.remove(node);
    info(`Trying to update mod ${node.id}, the installed version was removed from ficsit.app`);
  });

  const satisfactoryNode = {
    id: 'SatisfactoryGame',
    version: valid(coerce(satisfactoryVersion)),
    dependencies: {},
  } as LockfileGraphNode;
  graph.add(satisfactoryNode);
  await manifest.items.forEachAsync(async (item) => {
    const itemData = {
      id: `manifest_${item.id}`,
      version: '0.0.0',
      dependencies: {
        [item.id]: item.version || '>=0.0.0',
      },
    } as LockfileGraphNode;
    await graph.add(itemData);
  });

  const removedUninstall: Array<string> = [];
  await graph.nodes
    .map((node) => Object.keys(node.dependencies))
    .reduce((acc, cur) => acc.concat(cur))
    .filter(unique)
    .forEachAsync(async (dep) => {
      try {
        await graph.validate(dep);
      } catch (e) {
        if (e instanceof ModNotFoundError) {
          if (modsRemovedFromFicsitApp.some((rem) => rem.id === e.modID)) {
            removedUninstall.push(e.modID);
            return;
          }
        } else if (e instanceof ValidationError) {
          if (modsRemovedFromFicsitApp.some((rem) => rem.id === e.modID)) {
            removedUninstall.push((e as ModNotFoundError).modID);
            return;
          }
          let inner: Error = e.innerError;
          while (inner instanceof ValidationError) {
            if (inner instanceof ModNotFoundError) {
              const id = inner.modID;
              if (modsRemovedFromFicsitApp.some((rem) => rem.id === id)) {
                removedUninstall.push((inner as ModNotFoundError).modID);
                return;
              }
            }
            inner = inner.innerError;
          }
        }
        throw e;
      }
    });

  if (removedUninstall.length > 0) {
    removedUninstall.forEach((rem) => {
      info(`Removing ${rem}, it was removed from ficsit.app`);
    });
    return mutateManifest(original, satisfactoryVersion, install, uninstall.concat(removedUninstall), update);
  }

  graph.cleanup();
  graph.remove(satisfactoryNode);
  return {
    manifest,
    lockfile: graph.toLockfile(),
  };
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

export function readLockfile(filePath: string): Lockfile {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

export function writeLockfile(filePath: string, lockfile: Lockfile): void {
  fs.writeFileSync(filePath, JSON.stringify(lockfile));
}

export function getItemsList(lockfile: Lockfile): ItemVersionList {
  return mapObject(lockfile, (id, data) => [id, data.version]);
}
