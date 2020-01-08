import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { appDataDir, ensureExists, forEachAsync } from './utils';
import {
  LockfileGraph, lockfileDifference, ItemVersionList, Lockfile, getItemData, LockfileDiff,
} from './lockfile';

interface Manifest {
  manifestForPath: string;
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
        manifestForPath,
        items: {} as ItemVersionList,
      } as Manifest);
      this.writeLockfile({} as Lockfile);
    }
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
    this.writeManifest(manifest);

    const initialLockfile = this.readLockfile();
    const graph = new LockfileGraph();
    await graph.fromLockfile(initialLockfile);
    graph.roots().forEach((root) => {
      if (!(root.id in manifest.items)) {
        graph.remove(root);
      }
    });
    await forEachAsync(Object.entries(manifest.items), async (itemVersion) => {
      const id = itemVersion[0];
      const version = itemVersion[1];
      const itemData = await getItemData(id, version);
      await graph.add(itemData);
    });
    graph.cleanup();
    const newLockfile = graph.toLockfile();
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
