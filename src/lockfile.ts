import { satisfies } from 'semver';
import { removeArrayElement, removeArrayElementWhere, forEachAsync } from './utils';
import { findAllVersionsMatchingAll } from './ficsitApp';
import { getCachedMod } from './modHandler';

export interface ItemVersionList {
  [id: string]: string;
}

export interface LockfileGraphNode {
  id: string;
  version: string;
  dependencies: ItemVersionList;
}

export interface LockfileGraphEdge {
  from: LockfileGraphNode;
  to: LockfileGraphNode;
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
    return { id, version, dependencies: {} };
  }
  // TODO: Get data from ficsit.app so the mod doesn't have to be downloaded
  const modData = await getCachedMod(id, version);
  return {
    id: modData.mod_id,
    version: modData.version,
    dependencies: modData.dependencies ? modData.dependencies : {},
  };
}

export class LockfileGraph {
  nodes = new Array<LockfileGraphNode>();
  edges = new Array<LockfileGraphEdge>();
  entryNodeMap = new Map<string, LockfileGraphNode>();
  rootNodes = new Array<LockfileGraphNode>();

  async fromLockfile(lockfile: Lockfile): Promise<void> {
    Object.keys(lockfile).forEach((entry) => {
      const node = {
        id: entry,
        version: lockfile[entry].version,
        dependencies: lockfile[entry].dependencies,
      } as LockfileGraphNode;
      this.entryNodeMap.set(entry, node);
      this.nodes.push(node);
    });
    this.nodes.forEach((node) => {
      this.createEdges(node);
    });
    this.rootNodes = this.nodes.filter((node) => this.getDependants(node).length === 0);
  }

  async createEdges(node: LockfileGraphNode): Promise<boolean> {
    try {
      await forEachAsync(Object.entries(node.dependencies), (async (dependency) => {
        const dependencyID = dependency[0];
        const versionConstraint = dependency[1];
        let dependencyNode = this.entryNodeMap.get(dependencyID);
        if (!dependencyNode || !satisfies(dependencyNode.version, versionConstraint)) {
          if (dependencyNode) {
            this.remove(dependencyNode);
          }
          const versionConstraints = this.nodes
            .filter((graphNode) => dependencyID in graphNode.dependencies)
            .map((graphNode) => graphNode.dependencies[dependencyID]);
          const matchingDependencyVersions = await findAllVersionsMatchingAll(dependencyID,
            versionConstraints);
          matchingDependencyVersions.reverse();
          let found = false;
          while (!found && matchingDependencyVersions.length > 0) {
            const version = matchingDependencyVersions.pop();
            if (!version) { break; }
            // eslint-disable-next-line no-await-in-loop
            const itemData = await getItemData(dependencyID, version);
            // eslint-disable-next-line no-await-in-loop
            if (await this.add(itemData)) {
              found = true;
              break;
            }
            this.remove(itemData);
          }
          if (!found) {
            throw new Error(`No version found for dependency ${dependencyID} of ${node.id}`);
          }
          dependencyNode = this.entryNodeMap.get(dependencyID);
        }
        this.edges.push({
          from: node,
          to: dependencyNode,
        } as LockfileGraphEdge);
      }));
    } catch (e) {
      return false;
    }
    return true;
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
    return this.rootNodes;
  }

  getDependants(node: LockfileGraphNode): Array<LockfileGraphNode> {
    return this.edges.filter((edge) => edge.to === node).map((edge) => edge.from);
  }

  remove(node: LockfileGraphNode): void {
    removeArrayElementWhere(this.edges, (edge) => edge.to === node || edge.from === node);
    removeArrayElement(this.nodes, node);
    removeArrayElement(this.rootNodes, node);
  }

  async add(node: LockfileGraphNode): Promise<boolean> {
    if (this.entryNodeMap.has(node.id)) {
      return false;
    }
    let success = true;
    this.entryNodeMap.set(node.id, node);
    this.nodes.push(node);
    success = await this.createEdges(node);
    this.rootNodes.push(node);
    if (!success) {
      this.remove(node);
    }
    return success;
  }

  isNodeDangling(node: LockfileGraphNode): boolean {
    return !this.rootNodes.includes(node)
     && this.getDependants(node).length === 0;
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
