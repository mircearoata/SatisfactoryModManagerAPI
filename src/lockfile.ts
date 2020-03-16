import {
  satisfies, compare, valid, coerce,
} from 'semver';
import {
  removeArrayElement, removeArrayElementWhere, forEachAsync,
} from './utils';
import { findAllVersionsMatchingAll, getSMLVersionInfo, getBootstrapperVersionInfo } from './ficsitApp';
import { getCachedMod } from './modHandler';
import {
  UnsolvableDependencyError, DependencyManifestMismatchError,
  InvalidLockfileOperation,
  ModNotFoundError,
} from './errors';
import { SMLModID } from './smlHandler';
import { BootstrapperModID } from './bootstrapperHandler';
import { debug } from './logging';

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

export async function getItemData(id: string, version: string): Promise<LockfileGraphNode> {
  if (id === SMLModID) {
    const smlVersionInfo = await getSMLVersionInfo(version);
    if (smlVersionInfo === undefined) {
      throw new ModNotFoundError(`SML@${version} not found`);
    }
    return { id, version, dependencies: { SatisfactoryGame: `>=${valid(coerce(smlVersionInfo.satisfactory_version.toString()))}`, [BootstrapperModID]: `>=${smlVersionInfo.bootstrap_version}` } };
  }
  if (id === BootstrapperModID) {
    const bootstrapperVersionInfo = await getBootstrapperVersionInfo(version);
    if (bootstrapperVersionInfo === undefined) {
      throw new ModNotFoundError(`bootstrapper@${version} not found`);
    }
    return { id, version, dependencies: { SatisfactoryGame: `>=${valid(coerce(bootstrapperVersionInfo.satisfactory_version.toString()))}` } };
  }
  if (id === 'SatisfactoryGame') {
    throw new InvalidLockfileOperation('SMLauncher cannot modify Satisfactory Game version. This should never happen, unless Satisfactory was not temporarily added to the lockfile as a manifest entry');
  }
  // TODO: Get mod data from ficsit.app so the mod doesn't have to be downloaded
  const modData = await getCachedMod(id, version);
  if (!modData.dependencies) { modData.dependencies = {}; }
  if (modData.sml_version) {
    modData.dependencies[SMLModID] = `^${valid(coerce(modData.sml_version))}`;
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

  async validate(node: LockfileGraphNode): Promise<void> {
    await forEachAsync(Object.entries(node.dependencies), (async (dependency) => {
      const dependencyID = dependency[0];
      const versionConstraint = dependency[1];
      const dependencyNode = this.nodes.find((graphNode) => graphNode.id === dependencyID);
      if (!dependencyNode || !satisfies(dependencyNode.version, versionConstraint)) {
        if (dependencyNode) {
          if (dependencyNode.isInManifest) {
            if (dependencyID === 'SatisfactoryGame') {
              throw new DependencyManifestMismatchError(`Satisfactory version ${coerce(dependencyNode.version)?.major} is too old. ${node.id}@${node.version} requires ${versionConstraint}`);
            }
            throw new DependencyManifestMismatchError(`Dependency ${dependencyID}@${dependencyNode.version} is too old for ${node.id}@${node.version} (requires ${versionConstraint}), and it is installed by you. Uninstall it then try again.`);
          } else {
            debug(`Dependency ${dependencyID}@${dependencyNode.version} is NOT GOOD for ${node.id}@${node.version} (requires ${versionConstraint})`);
            this.remove(dependencyNode);
          }
        }
        const versionConstraints = this.nodes
          .filter((graphNode) => graphNode.dependencies[dependencyID])
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
          try {
            // eslint-disable-next-line no-await-in-loop
            await this.add(itemData);
            found = true;
            break;
          } catch (e) {
            this.remove(itemData);
          }
        }
        if (!found) {
          if (dependencyNode) {
            await this.add(dependencyNode);
          }
          throw new UnsolvableDependencyError(`No version found for dependency ${dependencyID} of ${node.id}`);
        }
      } else {
        debug(`Dependency ${dependencyID}@${dependencyNode.version} is GOOD for ${node.id}@${node.version} (requires ${versionConstraint})`);
      }
    }));
  }

  async validateAll(): Promise<void> {
    return forEachAsync(this.nodes, async (graphNode) => this.validate(graphNode));
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
    return this.nodes.filter((graphNode) => graphNode.dependencies[node.id]);
  }

  remove(node: LockfileGraphNode): void {
    removeArrayElement(this.nodes, node);
    debug(`Removed ${node.id}@${node.version}`);
  }

  async add(node: LockfileGraphNode): Promise<void> {
    if (this.nodes.some((graphNode) => graphNode.id === node.id)) {
      const existingNode = this.nodes.find((graphNode) => graphNode.id === node.id);
      debug(`Item ${node.id} already has another version installed: ${existingNode?.version}`);
    } else {
      debug(`Adding ${node.id}@${node.version}`);
      try {
        this.nodes.push(node);
        // await this.validate(node);
        debug(`Added ${node.id}@${node.version}`);
      } catch (e) {
        this.remove(node);
        debug(`Failed adding ${node.id}@${node.version}. ${e.message}`);
        throw e;
      }
    }
  }

  isNodeDangling(node: LockfileGraphNode): boolean {
    return this.getDependants(node).length === 0 && !node.isInManifest;
  }

  private get _danglingCount(): number {
    return this.nodes.filter((node) => this.isNodeDangling(node)).length;
  }

  cleanup(): void {
    while (this._danglingCount > 0) {
      this.nodes.forEach((node) => {
        if (this.isNodeDangling(node)) {
          debug(`${node.id}@${node.version} is not needed anymore. Will be deleted`);
        }
      });
      removeArrayElementWhere(this.nodes, (node) => this.isNodeDangling(node));
    }
    this.nodes.forEach((node) => {
      debug(`${node.id}@${node.version} is still needed by [${this.getDependants(node)
        .map((current) => `${current.id}@${current.version}`).join(', ')}]`);
    });
    removeArrayElementWhere(this.nodes, (node) => node.isInManifest || false);
  }
}
