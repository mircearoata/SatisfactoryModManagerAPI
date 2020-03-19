import path from 'path';
import fs from 'fs';
import { valid, coerce } from 'semver';
import {
  ensureExists, mapObject, forEachAsync, dirs, oldAppDataDir, deleteFolderRecursive, removeArrayElementWhere, manifestsDir,
} from './utils';
import {
  LockfileGraph, Lockfile, LockfileGraphNode, ItemVersionList,
} from './lockfile';
import { debug } from './logging';

export interface ManifestItem {
  id: string;
  version?: string;
}

export interface Manifest {
  manifestVersion: ManifestVersion;
  satisfactoryVersion: string;
  items: Array<ManifestItem>;
}

export enum ManifestVersion {
  // pre 1.1.3, unversioned
  AddedManifestVersions, // Fixed typo in upgraded manifests
  LatestPlusOne,
  Latest = LatestPlusOne - 1
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkUpgradeManifest(manifest: any): Manifest {
  const upgradedManifest = { manifestVersion: ManifestVersion.Latest, items: [], satisfactoryVersion: '0' } as Manifest;
  upgradedManifest.satisfactoryVersion = manifest.satisfactoryVersion;
  if (manifest.manifestVersion) {
    // Nothing here yet
  } else if (manifest.item) {
    upgradedManifest.items = manifest.item;
  } else if (manifest.items) {
    upgradedManifest.items = manifest.items;
  }
  return upgradedManifest;
}

export class ManifestHandler {
  private _manifestPath: string;

  constructor(manifestPath: string) {
    this._manifestPath = manifestPath;
    if (!fs.existsSync(this._manifestPath)) {
      ensureExists(this._manifestPath);
      this.writeManifest({
        manifestVersion: ManifestVersion.Latest,
        satisfactoryVersion: '0',
        items: [],
      } as Manifest);
      this.writeLockfile({} as Lockfile);
    }
  }

  async setSatisfactoryVersion(satisfactoryVersion: string): Promise<void> {
    const manifest = this.readManifest();
    manifest.satisfactoryVersion = satisfactoryVersion;
    this.writeManifest(manifest);
  }

  async mutate(install: Array<ManifestItem>, uninstall: Array<string>, update: Array<string>): Promise<void> {
    const manifest = this.readManifest();
    uninstall.forEach((item) => {
      removeArrayElementWhere(manifest.items, (manifestItem) => manifestItem.id === item);
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

    const initialLockfile = this.readLockfile();
    const graph = new LockfileGraph();
    await graph.fromLockfile(initialLockfile);
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
    const satisfactoryNode = {
      id: 'SatisfactoryGame',
      version: valid(coerce(manifest.satisfactoryVersion)),
      dependencies: {},
      isInManifest: true,
    } as LockfileGraphNode;
    graph.add(satisfactoryNode);
    await forEachAsync(manifest.items, async (item) => {
      const itemData = {
        id: `manifest_${item.id}`,
        version: '0.0.0',
        dependencies: {
          [item.id]: item.version || '>=0.0.0',
        },
      } as LockfileGraphNode;
      itemData.isInManifest = true;
      try {
        await graph.add(itemData);
      } catch (e) {
        debug(`Failed to install ${item}. Changes will be discarded. ${e}`);
        throw e;
      }
    });
    await graph.validateAll();
    graph.cleanup();
    graph.remove(satisfactoryNode);
    const newLockfile = graph.toLockfile();
    this.writeManifest(manifest);
    this.writeLockfile(newLockfile);
  }

  readManifest(): Manifest {
    try {
      return checkUpgradeManifest(JSON.parse(fs.readFileSync(this.getManifestFilePath(), 'utf8')));
    } catch (e) {
      return {
        manifestVersion: ManifestVersion.Latest,
        satisfactoryVersion: '0',
        items: [],
      };
    }
  }

  writeManifest(manifest: Manifest): void {
    return fs.writeFileSync(this.getManifestFilePath(), JSON.stringify(manifest));
  }

  readLockfile(): Lockfile {
    try {
      return JSON.parse(fs.readFileSync(this.getLockfilePath(), 'utf8'));
    } catch (e) {
      return {};
    }
  }

  writeLockfile(lockfile: Lockfile): void {
    return fs.writeFileSync(this.getLockfilePath(), JSON.stringify(lockfile));
  }

  getManifestFilePath(): string {
    return path.join(this._manifestPath, 'manifest.json');
  }

  getLockfilePath(): string {
    return path.join(this._manifestPath, 'lock.json');
  }

  getItemsList(): ItemVersionList {
    return mapObject(this.readLockfile(), (id, data) => [id, data.version]);
  }
}

// Convert old manifests to new format and location
dirs(oldAppDataDir).forEach((manifestID) => {
  const fullOldManifestDirPath = path.join(oldAppDataDir, manifestID);
  let manifest: { satisfactoryVersion: string; items: ItemVersionList };
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(fullOldManifestDirPath, 'manifest.json'), 'utf8'));
  } catch (e) {
    manifest = { satisfactoryVersion: '0', items: {} };
  }
  let lockfile;
  try {
    lockfile = JSON.parse(fs.readFileSync(path.join(fullOldManifestDirPath, 'lock.json'), 'utf8'));
  } catch (e) {
    lockfile = {};
  }


  const newManifest = {
    satisfactoryVersion: manifest.satisfactoryVersion,
    items: Object.keys(manifest.items).map((item) => ({ id: item, version: manifest.items[item] } as ManifestItem)),
  };

  ensureExists(path.join(manifestsDir, manifestID));
  fs.writeFileSync(path.join(manifestsDir, manifestID, 'manifest.json'), JSON.stringify(newManifest));
  fs.writeFileSync(path.join(manifestsDir, manifestID, 'lock.json'), JSON.stringify(lockfile));

  deleteFolderRecursive(fullOldManifestDirPath);
});
