import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { valid, coerce } from 'semver';
import {
  appDataDir, ensureExists, forEachAsync, debug,
} from './utils';
import {
  LockfileGraph, Lockfile, LockfileDiff, LockfileGraphNode, ItemVersionList,
  lockfileDifference, getItemData,
} from './lockfile';

interface Manifest {
  satisfactoryVersion: string;
  items: ItemVersionList;
}

export function getManifestFilePath(satisfactoryPath: string): string {
  return path.join(appDataDir, createHash('sha256').update(satisfactoryPath, 'utf8').digest('hex'));
}

export class ManifestHandler {
  private manifestPath: string;

  constructor(manifestForPath: string) {
    this.manifestPath = getManifestFilePath(manifestForPath);
    if (!fs.existsSync(this.manifestPath)) {
      ensureExists(this.manifestPath);
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

  async mutate(install: ItemVersionList, uninstall: Array<string>): Promise<LockfileDiff> {
    const manifest = this.readManifest();
    uninstall.forEach((item) => {
      delete manifest.items[item];
    });
    Object.entries(install).forEach((itemVersion) => {
      const id = itemVersion[0];
      const version = itemVersion[1];
      manifest.items[id] = version;
    });

    const initialLockfile = this.readLockfile();
    const graph = new LockfileGraph();
    await graph.fromLockfile(initialLockfile);
    graph.roots().forEach((root) => {
      if (!(root.id in manifest.items) || root.version !== manifest.items[root.id]) {
        graph.remove(root);
      }
    });
    let success = true;
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
      if (success) {
        const id = itemVersion[0];
        const version = itemVersion[1];
        const itemData = await getItemData(id, version);
        itemData.isInManifest = true;
        if (!graph.nodes.some((node) => node.id === id && node.version === version)) {
          if (!await graph.add(itemData)) {
            debug(`Failed to install ${id}@${version}. Will roll back.`);
            success = false;
          }
        }
      }
    });
    if (!success) {
      debug('Rolling back manifest mutation.');
      return { install: {}, uninstall: [] };
    }
    await graph.validateAll();
    graph.cleanup();
    graph.remove(satisfactoryNode);
    const newLockfile = graph.toLockfile();
    this.writeManifest(manifest);
    this.writeLockfile(newLockfile);

    return lockfileDifference(initialLockfile, newLockfile);
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
    return path.join(this.manifestPath, 'manifest.json');
  }

  getLockfilePath(): string {
    return path.join(this.manifestPath, 'lock.json');
  }
}
