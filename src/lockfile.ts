/* eslint-disable no-await-in-loop */
import {
  compare, valid, coerce, satisfies,
} from 'semver';
import {
  findAllVersionsMatchingAll, getSMLVersionInfo, getBootstrapperVersionInfo, getModDownloadLink, getMod, getModVersion,
} from './ficsitApp';
import { getCachedMod } from './modHandler';
import {
  ImcompatibleGameVersion,
  UnsolvableDependencyError,
  DependencyManifestMismatchError,
  InvalidLockfileOperation,
  ModNotFoundError,
  ModRemovedByAuthor,
} from './errors';
import { SMLModID } from './smlHandler';
import { BootstrapperModID } from './bootstrapperHandler';
import { debug, info } from './logging';
import { versionSatisfiesAll, unique } from './utils';

export interface ItemVersionList {
  [id: string]: string;
}

export interface LockfileGraphNode {
  id: string;
  version: string;
  dependencies: ItemVersionList;
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
    throw new InvalidLockfileOperation('SMManager cannot modify Satisfactory Game version. This should never happen, unless Satisfactory was not temporarily added to the lockfile as a manifest entry');
  }
  // TODO: Get mod data from ficsit.app so the mod doesn't have to be downloaded
  if (!satisfies((await getModVersion(id, version)).sml_version, '>=2.0.0')) {
    throw new ModNotFoundError(`${id}@${version} is incompatible with SML 2.0`);
  }
  const modData = await getCachedMod(id, version);
  if (!modData) {
    throw new ModNotFoundError(`${id}@${version} not found`);
  }
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

export async function getFriendlyItemName(id: string): Promise<string> {
  if (id === SMLModID || id === BootstrapperModID) return id;
  if (id.startsWith('manifest_')) {
    try {
      return `installing ${(await getMod(id.substring('manifest_'.length))).name}`;
    } catch (e) {
      return id;
    }
  }
  try {
    return (await getMod(id)).name;
  } catch (e) {
    return id;
  }
}

async function versionExistsOnFicsitApp(id: string, version: string): Promise<boolean> {
  if (id === SMLModID) {
    return !!(await getSMLVersionInfo(version));
  }
  if (id === BootstrapperModID) {
    return !!(await getBootstrapperVersionInfo(version));
  }
  if (id === 'SatisfactoryGame') {
    return true;
  }
  try {
    await getModDownloadLink(id, version);
    return true;
  } catch (e) {
    if (e instanceof ModNotFoundError) {
      return false;
    }
    throw e;
  }
}

function gameVersionFromSemver(constraint: string): string {
  if (constraint.endsWith('.0.0')) return constraint.substring(0, constraint.length - '.0.0'.length);
  return constraint;
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

  async validate(dependency: string): Promise<void> {
    debug(`Validating ${dependency}`);
    const dependencyNode = this.findById(dependency);
    const isOnFicsitApp = dependencyNode && await versionExistsOnFicsitApp(dependency, dependencyNode.version);
    const dependants = this.getDependants(dependency);
    const constraints = dependants.map((node) => node.dependencies[dependency]);
    const versionValid = dependencyNode && versionSatisfiesAll(dependencyNode.version, constraints);
    const friendlyItemName = await getFriendlyItemName(dependency);
    const dependantsString = (await Promise.all(dependants.map(async (dependant) => `${friendlyItemName} (requires ${dependant.dependencies[dependency]})`))).join(', ');
    if (!isOnFicsitApp || !versionValid) {
      if (dependency === 'SatisfactoryGame') {
        if (!dependencyNode) {
          throw new Error('This should never happen. It is here just for typescript null check');
        }
        throw new ImcompatibleGameVersion(`Game version incompatible. Installed: ${gameVersionFromSemver(dependencyNode.version)}. ${(await Promise.all(dependants.map(async (dependant) => `${await getFriendlyItemName(dependant.id)} requires ${gameVersionFromSemver(dependant.dependencies[dependency])}`))).join(', ')}`);
      }
      if (dependencyNode) {
        this.remove(dependencyNode);
        if (!isOnFicsitApp) {
          info(`Version ${dependencyNode?.version} of ${friendlyItemName} was removed from ficsit.app. Removing and attempting to use the latest version available.`);
        }
      }
      let availableVersions;
      try {
        availableVersions = await findAllVersionsMatchingAll(dependency, constraints);
      } catch (e) {
        const manifestNode = this.findById(`manifest_${dependency}`);
        if (!manifestNode) {
          info(`${dependency} is a dependency of ${dependantsString}, but ficsit.app cannot find dependencies yet. Please install it manually.`);
          return;
        }
        if (!isOnFicsitApp) {
          throw new ModRemovedByAuthor(`Mod ${friendlyItemName} was removed by the author, and no other version is compatible`, dependency, dependencyNode?.version);
        }
        throw e;
      }
      availableVersions.sort(compare);
      let lastError: Error | null = null;
      while (availableVersions.length > 0) {
        const version = availableVersions.pop();
        if (version) {
          try {
            const newNode = await getItemData(dependency, version);
            try {
              this.add(newNode);
              await Object.keys(newNode.dependencies).forEachAsync(async (dep) => this.validate(dep));
              return;
            } catch (e) {
              debug(`${dependency}@${version} is not good: ${e.message} Trace:\n${e.stack}`);
              this.remove(newNode);
              lastError = e;
            }
          } catch (e) {
            if (e instanceof ModNotFoundError && !versionExistsOnFicsitApp(dependency, version)) {
              lastError = new ModRemovedByAuthor(`Mod ${await getFriendlyItemName(dependency)}@${version} is not compatible with SML 2.0`, dependency, version); //
            }
            lastError = e;
          }
        }
      }
      if (lastError && lastError instanceof ImcompatibleGameVersion) {
        throw lastError;
      }
      const manifestNode = this.findById(`manifest_${dependency}`);
      if (manifestNode && manifestNode.dependencies[dependency] !== '>=0.0.0') {
        if (dependants.length === 1) { // Only manifest
          throw new ModNotFoundError(`${friendlyItemName} was removed from ficsit.app`);
        }
        throw new DependencyManifestMismatchError(`${friendlyItemName} is a dependency of other mods, but an incompatible version is installed by you. Please uninstall it to use a compatible version. Dependants: ${dependantsString}`);
      }
      if (!isOnFicsitApp) {
        throw new ModRemovedByAuthor(`Mod ${friendlyItemName}@${dependencyNode?.version} was removed by the author, and no other version is compatible`, dependency, dependencyNode?.version);
      }
      throw new UnsolvableDependencyError(`No version of ${friendlyItemName} is compatible with the other installed mods`);
    }
  }

  async validateAll(): Promise<void> {
    await this.nodes
      .map((node) => Object.keys(node.dependencies))
      .reduce((acc, cur) => acc.concat(cur))
      .filter(unique)
      .forEachAsync((dep) => this.validate(dep));
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

  findById(id: string): LockfileGraphNode | undefined {
    return this.nodes.find((node) => node.id === id);
  }

  roots(): Array<LockfileGraphNode> {
    return this.nodes.filter((graphNode) => this.getDependants(graphNode.id).length === 0);
  }

  getDependants(node: string): Array<LockfileGraphNode> {
    return this.nodes.filter((graphNode) => graphNode.dependencies[node]);
  }

  remove(node: LockfileGraphNode): void {
    this.nodes.remove(node);
    debug(`Removed ${node.id}@${node.version}`);
  }

  async add(node: LockfileGraphNode): Promise<void> {
    if (this.nodes.some((graphNode) => graphNode.id === node.id)) {
      const existingNode = this.nodes.find((graphNode) => graphNode.id === node.id);
      debug(`Item ${await getFriendlyItemName(node.id)} already has another version installed: ${existingNode?.version}`);
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

  static isInManifest(node: LockfileGraphNode): boolean {
    return node.id.startsWith('manifest_');
  }

  isNodeDangling(node: LockfileGraphNode): boolean {
    return this.getDependants(node.id).length === 0 && !LockfileGraph.isInManifest(node);
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
      this.nodes.removeWhere((node) => this.isNodeDangling(node));
    }
    this.nodes.forEach((node) => {
      debug(`${node.id}@${node.version} is still needed by [${this.getDependants(node.id)
        .map((current) => `${current.id}@${current.version}`).join(', ')}]`);
    });
    this.nodes.removeWhere((node) => LockfileGraph.isInManifest(node));
  }
}
