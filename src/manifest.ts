import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { valid, coerce } from 'semver';
import {
  appDataDir, ensureExists, mapObject, forEachAsync, removeArrayElement, dirs, oldAppDataDir, deleteFolderRecursive,
} from './utils';
import {
  LockfileGraph, Lockfile, LockfileGraphNode, ItemVersionList,
} from './lockfile';
import { debug } from './logging';

export interface Manifest {
  satisfactoryVersion: string;
  items: Array<string>;
}

const manifestsDir = path.join(appDataDir, 'manifests');

export function getManifestFolderPath(satisfactoryPath: string): string {
  return path.join(manifestsDir, createHash('sha256').update(satisfactoryPath, 'utf8').digest('hex'));
}

export class ManifestHandler {
  private _manifestPath: string;

  constructor(manifestForPath: string) {
    this._manifestPath = getManifestFolderPath(manifestForPath);
    if (!fs.existsSync(this._manifestPath)) {
      ensureExists(this._manifestPath);
      this.writeManifest({
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

  async mutate(install: Array<string>, uninstall: Array<string>, update: Array<string>): Promise<void> {
    const manifest = this.readManifest();
    uninstall.forEach((item) => {
      removeArrayElement(manifest.items, item);
    });
    install.forEach((item) => {
      if (!manifest.items.includes(item)) {
        manifest.items.push(item);
      }
    });

    const initialLockfile = this.readLockfile();
    const graph = new LockfileGraph();
    await graph.fromLockfile(initialLockfile);
    graph.roots().forEach((root) => {
      if (!manifest.items.includes(root.id)) {
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
    Object.entries(manifest.items).forEach((itemVersion) => {
      const id = itemVersion[0];
      const version = itemVersion[1];
      const lockfileNode = graph.nodes.find((node) => node.id === id && node.version === version);
      if (lockfileNode) {
        lockfileNode.isInManifest = true;
      }
    });
    await forEachAsync(manifest.items, async (item) => {
      const itemData = {
        id: `manifest_${item}`,
        version: '0.0.0',
        dependencies: {
          [item]: '>= 0.0.0',
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
      return JSON.parse(fs.readFileSync(this.getManifestFilePath(), 'utf8'));
    } catch (e) {
      return {
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
  let manifest;
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

  manifest.items = Object.keys(manifest.items);

  ensureExists(path.join(manifestsDir, manifestID));
  fs.writeFileSync(path.join(manifestsDir, manifestID, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(manifestsDir, manifestID, 'lock.json'), JSON.stringify(lockfile));

  deleteFolderRecursive(fullOldManifestDirPath);
});
