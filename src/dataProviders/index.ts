import { satisfies } from 'semver';
import { ModNotFoundError } from '../errors';
import {
  versionSatisfiesAll, SMLID, BootstrapperID, minSMLVersion,
} from '../utils';
import * as ficsitApp from './ficsitApp';
import * as offline from './offlineProvider';
import {
  FicsitAppVersion, FicsitAppSMLVersion, FicsitAppBootstrapperVersion,
} from './types';

export async function getModName(modReference: string): Promise<string> {
  try {
    return await ficsitApp.getModName(modReference);
  } catch (eF) {
    try {
      return await offline.getModName(modReference);
    } catch (eO) {
      throw eF;
    }
  }
}

export async function getModVersions(modReference: string): Promise<Array<FicsitAppVersion>> {
  try {
    return await ficsitApp.getModVersions(modReference);
  } catch (eF) {
    try {
      return await offline.getModVersions(modReference);
    } catch (eO) {
      throw eF;
    }
  }
}

export async function getModVersion(modReference: string, version: string): Promise<FicsitAppVersion> {
  try {
    return await ficsitApp.getModVersion(modReference, version);
  } catch (eF) {
    try {
      return await offline.getModVersion(modReference, version);
    } catch (eO) {
      throw eF;
    }
  }
}

export async function getAvailableSMLVersions(): Promise<Array<FicsitAppSMLVersion>> {
  try {
    return await ficsitApp.getAvailableSMLVersions();
  } catch (eF) {
    try {
      return await offline.getAvailableSMLVersions();
    } catch (eO) {
      throw eF;
    }
  }
}

export async function getAvailableBootstrapperVersions(): Promise<Array<FicsitAppBootstrapperVersion>> {
  try {
    return await ficsitApp.getAvailableBootstrapperVersions();
  } catch (eF) {
    try {
      return await offline.getAvailableBootstrapperVersions();
    } catch (eO) {
      throw eF;
    }
  }
}

export async function getSMLVersionInfo(version: string): Promise<FicsitAppSMLVersion | undefined> {
  try {
    return await ficsitApp.getSMLVersionInfo(version);
  } catch (eF) {
    try {
      return await offline.getSMLVersionInfo(version);
    } catch (eO) {
      throw eF;
    }
  }
}

export async function getBootstrapperVersionInfo(version: string): Promise<FicsitAppBootstrapperVersion | undefined> {
  try {
    return await ficsitApp.getBootstrapperVersionInfo(version);
  } catch (eF) {
    try {
      return await offline.getBootstrapperVersionInfo(version);
    } catch (eO) {
      throw eF;
    }
  }
}

export async function findAllVersionsMatchingAll(item: string, versionConstraints: Array<string>): Promise<Array<string>> {
  if (item === SMLID) {
    const smlVersions = await getAvailableSMLVersions();
    return smlVersions
      .filter((smlVersion) => satisfies(smlVersion.version, `>=${minSMLVersion}`))
      .filter((smlVersion) => versionSatisfiesAll(smlVersion.version, versionConstraints))
      .map((smlVersion) => smlVersion.version);
  }
  if (item === BootstrapperID) {
    const bootstrapperVersions = await getAvailableBootstrapperVersions();
    return bootstrapperVersions
      .filter((bootstrapperVersion) => versionSatisfiesAll(bootstrapperVersion.version, versionConstraints))
      .map((bootstrapperVersion) => bootstrapperVersion.version);
  }
  const versions = await getModVersions(item);
  return versions
    .filter((modVersion) => versionSatisfiesAll(modVersion.version, versionConstraints))
    .map((modVersion) => modVersion.version);
}

export async function versionExistsOnFicsitApp(id: string, version: string): Promise<boolean> {
  if (id === SMLID) {
    return !!(await getSMLVersionInfo(version));
  }
  if (id === BootstrapperID) {
    return !!(await getBootstrapperVersionInfo(version));
  }
  if (id === 'FactoryGame') {
    return true;
  }
  try {
    return !!await getModVersion(id, version);
  } catch (e) {
    if (e instanceof ModNotFoundError) {
      return false;
    }
    throw e;
  }
}

export async function existsOnFicsitApp(id: string): Promise<boolean> {
  if (id === SMLID || id === BootstrapperID) {
    return true;
  }
  try {
    return !!await getModName(id);
  } catch (e) {
    if (e instanceof ModNotFoundError) {
      return false;
    }
    throw e;
  }
}
