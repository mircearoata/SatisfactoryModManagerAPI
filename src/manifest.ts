import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { valid, coerce } from 'semver';
import {
  appDataDir, ensureExists, forEachAsync, mapObject,
} from './utils';
import {
  LockfileGraph, Lockfile, LockfileGraphNode, ItemVersionList,
  getItemData,
} from './lockfile';
import { debug } from './logging';

interface Manifest {
  satisfactoryVersion: string;
  items: ItemVersionList;
}

export function getManifestFolderPath(satisfactoryPath: string): string {
  return path.join(appDataDir, createHash('sha256').update(satisfactoryPath, 'utf8').digest('hex'));
}

export class ManifestHandler {
  private _manifestPath: string;

  constructor(manifestForPath: string) {
    this._manifestPath = getManifestFolderPath(manifestForPath);
    if (!fs.existsSync(this._manifestPath)) {
      ensureExists(this._manifestPath);
      this.writeManifest({
        satisfactoryVersion: '0',
        items: {} as ItemVersionList,
      } as Manifest);
      this.writeLockfile({} as Lockfile);
    }
  }

  async setSatisfactoryVersion(satisfactoryVersion: string): Promise<void> {
    const manifest = this.readManifest();
    manifest.satisfactoryVersion = satisfactoryVersion;
    this.writeManifest(manifest);
  }

  async mutate(changes: ItemVersionList): Promise<void> {
    const manifest = this.readManifest();
    Object.entries(changes).filter((change) => change[1].length === 0).forEach((itemVersion) => {
      const id = itemVersion[0];
      delete manifest.items[id];
    });
    Object.entries(changes).filter((change) => change[1].length !== 0).forEach((itemVersion) => {
      const id = itemVersion[0];
      const version = itemVersion[1];
      manifest.items[id] = version;
    });

    const initialLockfile = this.readLockfile();
    const graph = new LockfileGraph();
    await graph.fromLockfile(initialLockfile);
    graph.roots().forEach((root) => {
      if (!(manifest.items[root.id]) || root.version !== manifest.items[root.id]) {
        graph.remove(root);
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
    await forEachAsync(Object.entries(manifest.items), async (itemVersion) => {
      const id = itemVersion[0];
      const version = itemVersion[1];
      const itemData = await getItemData(id, version);
      itemData.isInManifest = true;
      if (!graph.nodes.some((node) => node.id === id && node.version === version)) {
        try {
          await graph.add(itemData);
        } catch (e) {
          debug(`Failed to install ${id}@${version}. Changes will be discarded. ${e}`);
          throw e;
        }
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
    return JSON.parse(fs.readFileSync(this.getManifestFilePath(), 'utf8'));
  }

  writeManifest(manifest: Manifest): void {
    return fs.writeFileSync(this.getManifestFilePath(), JSON.stringify(manifest));
  }

  readLockfile(): Lockfile {
    return JSON.parse(fs.readFileSync(this.getLockfilePath(), 'utf8'));
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
