/* eslint-disable no-await-in-loop */
import {
  compare, valid, coerce,
} from 'semver';
import {
  findAllVersionsMatchingAll, getSMLVersionInfo, getBootstrapperVersionInfo, getModVersion, getModName,
} from './ficsitApp';
import {
  ImcompatibleGameVersion,
  UnsolvableDependencyError,
  DependencyManifestMismatchError,
  InvalidLockfileOperation,
  ModNotFoundError,
  ValidationError,
} from './errors';
import { debug } from './logging';
import { versionSatisfiesAll, SMLID, BootstrapperID } from './utils';

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
  if (id === SMLID) {
    const smlVersionInfo = await getSMLVersionInfo(version);
    if (smlVersionInfo === undefined) {
      throw new ModNotFoundError(`SML@${version} not found`, 'SML', version);
    }
    return { id, version, dependencies: { FactoryGame: `>=${valid(coerce(smlVersionInfo.satisfactory_version.toString()))}`, [BootstrapperID]: `>=${smlVersionInfo.bootstrap_version}` } };
  }
  if (id === BootstrapperID) {
    const bootstrapperVersionInfo = await getBootstrapperVersionInfo(version);
    if (bootstrapperVersionInfo === undefined) {
      throw new ModNotFoundError(`bootstrapper@${version} not found`, 'bootstrapper', version);
    }
    return { id, version, dependencies: { FactoryGame: `>=${valid(coerce(bootstrapperVersionInfo.satisfactory_version.toString()))}` } };
  }
  if (id === 'FactoryGame') {
    throw new InvalidLockfileOperation('Cannot modify Satisfactory Game version. This should never happen, unless Satisfactory was not temporarily added to the lockfile as a manifest entry');
  }
  const modData = await getModVersion(id, version);
  if (!modData) {
    throw new ModNotFoundError(`${id}@${version} not found`, id, version);
  }
  if (!modData.dependencies) { modData.dependencies = []; }
  if (!modData.dependencies.some((dep) => dep.mod_id === 'SML') && modData.sml_version) {
    modData.dependencies.push({ mod_id: SMLID, condition: `^${valid(coerce(modData.sml_version))}`, optional: false });
  }
  return {
    id,
    version: modData.version,
    dependencies: modData.dependencies
      ? modData.dependencies.reduce((prev, current) => (!current.optional ? Object.assign(prev, { [current.mod_id]: current.condition }) : prev), {})
      : {},
  };
}

export async function getFriendlyItemName(id: string): Promise<string> {
  if (id === SMLID || id === BootstrapperID || id === 'FactoryGame') return id;
  if (id.startsWith('manifest_')) {
    try {
      return `installing ${(await getModName(id.substring('manifest_'.length)))}`;
    } catch (e) {
      return id;
    }
  }
  try {
    return (await getModName(id));
  } catch (e) {
    return id;
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
    const dependants = this.getDependants(dependency);
    const constraints = dependants.map((node) => node.dependencies[dependency]);
    const versionValid = dependencyNode && versionSatisfiesAll(dependencyNode.version, constraints);
    if (!versionValid) {
      const friendlyItemName = await getFriendlyItemName(dependency);
      const dependantsString = (await Promise.all(dependants.map(async (dependant) => `${await getFriendlyItemName(dependant.id)} (requires ${dependant.dependencies[dependency]})`))).join(', ');
      if (dependency === 'FactoryGame') {
        if (!dependencyNode) {
          throw new Error('This should never happen. It is here just for typescript null check');
        }
        throw new ImcompatibleGameVersion(`Game version incompatible. Installed: ${gameVersionFromSemver(dependencyNode.version)}. ${(await Promise.all(dependants.map(async (dependant) => `${await getFriendlyItemName(dependant.id)} requires ${gameVersionFromSemver(dependant.dependencies[dependency])}`))).join(', ')}`);
      }
      if (dependencyNode) {
        this.remove(dependencyNode);
      }
      const availableVersions = await findAllVersionsMatchingAll(dependency, constraints);
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
            lastError = e;
          }
        }
      }
      if (lastError
        && (lastError instanceof ImcompatibleGameVersion
          || lastError instanceof ModNotFoundError
          || lastError instanceof UnsolvableDependencyError
          || lastError instanceof ValidationError)) {
        throw new ValidationError(`Error installing ${friendlyItemName}`, lastError, dependency, dependencyNode?.version);
      }
      const manifestNode = this.findById(`manifest_${dependency}`);
      if (manifestNode && manifestNode.dependencies[dependency] !== '>=0.0.0') {
        if (dependants.length === 1) { // Only manifest
          throw new ModNotFoundError(`${friendlyItemName} does not exist on ficsit.app`, dependency);
        }
        throw new DependencyManifestMismatchError(`${friendlyItemName} is a dependency of other mods, but an incompatible version is installed by you. Please uninstall it to use a compatible version. Dependants: ${dependantsString}`);
      }
      throw new UnsolvableDependencyError(`No version of ${friendlyItemName} is compatible with the other installed mods`, dependency);
    }
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
  }

  removeWhere(cb: (node: LockfileGraphNode) => boolean): void {
    this.nodes.removeWhere((node) => cb(node));
  }

  async add(node: LockfileGraphNode): Promise<void> {
    if (this.nodes.some((graphNode) => graphNode.id === node.id)) {
      const existingNode = this.nodes.find((graphNode) => graphNode.id === node.id);
      debug(`Item ${await getFriendlyItemName(node.id)} already has another version installed: ${existingNode?.version}`);
    } else {
      this.nodes.push(node);
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
      this.nodes.removeWhere((node) => this.isNodeDangling(node));
    }
    this.nodes.removeWhere((node) => LockfileGraph.isInManifest(node));
  }
}
