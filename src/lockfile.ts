import {
  satisfies, compare, valid, coerce,
} from 'semver';
import {
  removeArrayElement, removeArrayElementWhere, forEachAsync, debug,
} from './utils';
import { findAllVersionsMatchingAll, getSMLVersionInfo } from './ficsitApp';
import { getCachedMod } from './modHandler';

export interface ItemVersionList {
  [id: string]: string;
}

export interface LockfileGraphNode {
  id: string;
  version: string;
  dependencies: ItemVersionList;
  isInManifest?: boolean;
}

export interface Lockfile {
  [id: string]: LockfileItemData;
}

export interface LockfileItemData {
  version: string;
  dependencies: ItemVersionList;
}

export interface LockfileDiff {
  install: ItemVersionList;
  uninstall: Array<string>;
}

export async function getItemData(id: string, version: string): Promise<LockfileGraphNode> {
  if (id === 'SML') {
    const smlVersionInfo = await getSMLVersionInfo(version);
    if (smlVersionInfo === undefined) {
      throw new Error(`SML@${version} not found.`);
    }
    return { id, version, dependencies: { SatisfactoryGame: `>=${valid(coerce(smlVersionInfo.satisfactory_version.toString()))}` } };
  }
  if (id === 'SatisfactoryGame') {
    throw new Error('SMLauncher cannot modify Satisfactory Game version');
  }
  // TODO: Get mod data from ficsit.app so the mod doesn't have to be downloaded
  const modData = await getCachedMod(id, version);
  if (!modData.dependencies) { modData.dependencies = {}; }
  if (modData.sml_version) {
    modData.dependencies['SML'] = `>=${valid(coerce(modData.sml_version))}`;
  }
  return {
    id: modData.mod_id,
    version: modData.version,
    dependencies: modData.dependencies ? modData.dependencies : {},
  };
}

export class LockfileGraph {
  nodes = new Array<LockfileGraphNode>();

  async fromLockfile(lockfile: Lockfile): Promise<void> {
    Object.keys(lockfile).forEach((entry) => {
      const node = {
        id: entry,
        version: lockfile[entry].version,
        dependencies: lockfile[entry].dependencies,
      } as LockfileGraphNode;
      this.nodes.push(node);
    });
  }

  async validate(node: LockfileGraphNode): Promise<boolean> {
    try {
      await forEachAsync(Object.entries(node.dependencies), (async (dependency) => {
        const dependencyID = dependency[0];
        const versionConstraint = dependency[1];
        const dependencyNode = this.nodes.find((graphNode) => graphNode.id === dependencyID);
        if (!dependencyNode || !satisfies(dependencyNode.version, versionConstraint)) {
          if (dependencyNode) {
            if (dependencyNode.isInManifest) {
              throw new Error(`Dependency ${dependencyID}@${dependencyNode.version} is NOT GOOD for ${node.id}@${node.version} (requires ${versionConstraint}), and it is in the manifest.`);
            } else {
              debug(`Dependency ${dependencyID}@${dependencyNode.version} is NOT GOOD for ${node.id}@${node.version} (requires ${versionConstraint})`);
              this.remove(dependencyNode);
            }
          }
          const versionConstraints = this.nodes
            .filter((graphNode) => dependencyID in graphNode.dependencies)
            .map((graphNode) => graphNode.dependencies[dependencyID]);
          debug(`Dependency ${dependencyID} must match ${versionConstraints}`);
          const matchingDependencyVersions = await findAllVersionsMatchingAll(dependencyID,
            versionConstraints);
          matchingDependencyVersions.sort((a, b) => compare(a, b));
          debug(`Found versions ${matchingDependencyVersions}`);
          let found = false;
          while (!found && matchingDependencyVersions.length > 0) {
            const version = matchingDependencyVersions.pop();
            if (!version) { break; }
            // eslint-disable-next-line no-await-in-loop
            const itemData = await getItemData(dependencyID, version);
            debug(`Trying ${version}`);
            // eslint-disable-next-line no-await-in-loop
            if (await this.add(itemData)) {
              found = true;
              break;
            }
            this.remove(itemData);
          }
          if (!found) {
            if (dependencyNode) {
              await this.add(dependencyNode);
            }
            throw new Error(`No version found for dependency ${dependencyID} of ${node.id}. Rolling back.`);
          }
        } else {
          debug(`Dependency ${dependencyID}@${dependencyNode.version} is GOOD for ${node.id}@${node.version} (requires ${versionConstraint})`);
        }
      }));
    } catch (e) {
      debug(e.message);
      return false;
    }
    return true;
  }

  async validateAll(): Promise<void> {
    this.nodes.forEach((graphNode) => this.validate(graphNode));
  }

  toLockfile(): Lockfile {
    const lockfile = {} as Lockfile;
    this.nodes.forEach((node) => {
      lockfile[node.id] = {
        version: node.version,
        dependencies: node.dependencies,
      };
    });
    return lockfile;
  }

  roots(): Array<LockfileGraphNode> {
    return this.nodes.filter((graphNode) => this.getDependants(graphNode).length === 0);
  }

  getDependants(node: LockfileGraphNode): Array<LockfileGraphNode> {
    return this.nodes.filter((graphNode) => node.id in graphNode.dependencies);
  }

  remove(node: LockfileGraphNode): void {
    removeArrayElement(this.nodes, node);
    debug(`Removed ${node.id}@${node.version}`);
  }

  async add(node: LockfileGraphNode): Promise<boolean> {
    if (this.nodes.some((graphNode) => graphNode.id === node.id)) {
      const existingNode = this.nodes.find((graphNode) => graphNode.id === node.id);
      debug(`Item ${node.id} already has another version installed: ${existingNode?.version}`);
      return false;
    }
    debug(`Adding ${node.id}@${node.version}`);
    let success = true;
    this.nodes.push(node);
    success = await this.validate(node);
    if (!success) {
      this.remove(node);
      debug(`Failed adding ${node.id}@${node.version}`);
      return false;
    }
    debug(`Added ${node.id}@${node.version}`);
    return true;
  }

  isNodeDangling(node: LockfileGraphNode): boolean {
    return this.getDependants(node).length === 0 && !node.isInManifest;
  }

  cleanup(): void {
    removeArrayElementWhere(this.nodes, (node) => this.isNodeDangling(node));
  }
}

export function lockfileDifference(oldLockfile: Lockfile, newLockfile: Lockfile): LockfileDiff {
  const uninstall = [] as Array<string>;
  const install = {} as ItemVersionList;
  Object.keys(oldLockfile).forEach((id) => {
    if (!(id in newLockfile) || oldLockfile[id].version !== newLockfile[id].version) {
      uninstall.push(id);
    }
  });
  Object.keys(newLockfile).forEach((id) => {
    if (!(id in oldLockfile) || oldLockfile[id].version !== newLockfile[id].version) {
      install[id] = newLockfile[id].version;
    }
  });
  return { install, uninstall };
}
