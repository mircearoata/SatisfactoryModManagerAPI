/* eslint-disable no-await-in-loop */
import {
  compare, valid, coerce, satisfies,
} from 'semver';
import fs from 'fs';
import _ from 'lodash';
import {
  findAllVersionsMatchingAll, getSMLVersionInfo, getBootstrapperVersionInfo, getModVersion, versionExistsOnFicsitApp, getModReferenceFromId,
} from './ficsitApp';
import {
  IncompatibleGameVersion,
  UnsolvableDependencyError,
  DependencyManifestMismatchError,
  InvalidLockfileOperation,
  ModNotFoundError,
  ValidationError,
  ModRemovedByAuthor,
} from './errors';
import { debug, info } from './logging';
import {
  versionSatisfiesAll, SMLID, BootstrapperID, unique, mapObject,
} from './utils';
import { Manifest } from './manifest';

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
    if (satisfies(version, '>=3.0.0')) {
      return { id, version, dependencies: { FactoryGame: `>=${valid(coerce(smlVersionInfo.satisfactory_version.toString()))}` } };
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
  let modData = await getModVersion(id, version);
  if (!modData) {
    throw new ModNotFoundError(`${id}@${version} not found`, id, version);
  }
  if (!modData.dependencies) { modData.dependencies = []; }
  if (!modData.dependencies.some((dep) => dep.mod_id === 'SML') && modData.sml_version) {
    modData = _.cloneDeep(modData);
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
  if (id.startsWith('manifest_')) {
    try {
      return `installing ${id.substring('manifest_'.length)}`;
    } catch (e) {
      return id;
    }
  }
  return id;
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
        throw new IncompatibleGameVersion(`Game version incompatible. Installed: ${gameVersionFromSemver(dependencyNode.version)}. ${(await Promise.all(dependants.map(async (dependant) => `${await getFriendlyItemName(dependant.id)} requires ${gameVersionFromSemver(dependant.dependencies[dependency])}`))).join(', ')}`);
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
        && (lastError instanceof IncompatibleGameVersion
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
        throw new DependencyManifestMismatchError(`${friendlyItemName} is a dependency of other mods, but an incompatible version is installed by you. Please uninstall it to use a compatible version. Dependants: ${dependantsString}`,
          dependency, dependants.map((depNode) => ({ id: depNode.id, constraint: depNode.dependencies[dependency] })));
      }
      throw new UnsolvableDependencyError(`No version of ${friendlyItemName} is compatible with the other installed mods. Dependants: ${dependantsString}`, dependency);
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

export async function computeLockfile(manifest: Manifest, lockfile: Lockfile, satisfactoryVersion: string, update: Array<string>): Promise<Lockfile> {
  const graph = new LockfileGraph();
  await graph.fromLockfile(lockfile);

  // Convert SatisfactoryGame to FactoryGame
  await Promise.all(graph.nodes.map(async (node) => {
    if (node.dependencies['SatisfactoryGame']) {
      node.dependencies['FactoryGame'] = node.dependencies['SatisfactoryGame'];
      delete node.dependencies['SatisfactoryGame'];
    }
  }));

  // Convert items from mod ID to mod reference
  await Promise.all(graph.nodes.map(async (node, idx) => {
    const isOnFicsitApp = await versionExistsOnFicsitApp(node.id, node.version);
    if (!isOnFicsitApp) {
      try {
        const modReference = await getModReferenceFromId(node.id);
        graph.nodes[idx].id = modReference;
        debug(`Converted mod ${modReference} from mod ID to mod reference in lockfile`);
      } catch (e) {
        if (!(e instanceof ModNotFoundError)) {
          throw e;
        }
      }
    }
  }));

  // Remove roots that are not in the manifest
  graph.roots().forEach((root) => {
    if (!manifest.items.some((manifestItem) => manifestItem.id === root.id && manifestItem.enabled)) {
      graph.remove(root);
    }
  });

  // Remove nodes that will be updated
  graph.removeWhere((node) => update.includes(node.id));

  const modsRemovedFromFicsitApp = await graph.nodes.filterAsync(async (node) => !(await versionExistsOnFicsitApp(node.id, node.version)));
  modsRemovedFromFicsitApp.forEach((node) => {
    graph.remove(node);
    info(`Trying to update mod ${node.id}, the installed version was removed from ficsit.app`);
  });

  const satisfactoryNode = {
    id: 'FactoryGame',
    version: valid(coerce(satisfactoryVersion)),
    dependencies: {},
  } as LockfileGraphNode;
  graph.add(satisfactoryNode);
  await manifest.items.forEachAsync(async (item) => {
    if (item.enabled) {
      const itemData = {
        id: `manifest_${item.id}`,
        version: '0.0.0',
        dependencies: {
          [item.id]: item.version || '>=0.0.0',
        },
      } as LockfileGraphNode;
      await graph.add(itemData);
    }
  });

  await graph.nodes
    .map((node) => Object.keys(node.dependencies))
    .reduce((acc, cur) => acc.concat(cur))
    .filter(unique)
    .forEachAsync(async (dep) => {
      try {
        await graph.validate(dep);
      } catch (e) {
        if (e instanceof ValidationError) {
          if (modsRemovedFromFicsitApp.some((n) => n.id === (e as ValidationError).item)) {
            throw new ModRemovedByAuthor(`${(e as ValidationError).item} was installed, but no compatible version exists (probably removed by author).`, (e as ValidationError).item, (e as ValidationError).version);
          }
        }
        throw e;
      }
    });

  graph.cleanup();
  graph.remove(satisfactoryNode);

  return graph.toLockfile();
}

export function readLockfile(filePath: string): Lockfile {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

export function writeLockfile(filePath: string, lockfile: Lockfile): void {
  fs.writeFileSync(filePath, JSON.stringify(lockfile));
}

export function getItemsList(lockfile: Lockfile): ItemVersionList {
  return mapObject(lockfile, (id, data) => [id, data.version]);
}
