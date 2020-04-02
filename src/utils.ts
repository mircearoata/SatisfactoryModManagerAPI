import { getDataHome, getCacheFolder } from 'platform-folders';
import path from 'path';
import fs from 'fs';
import request from 'request-promise-native';
import { satisfies } from 'semver';
import processExists from 'process-exists';
import { execSync } from 'child_process';
import {
  setLogsDir, setLogFileNameFormat, setLogDebug, debug,
} from './logging';
import { NetworkError } from './errors';

const oldAppName = 'SatisfactoryModLauncher';
export const appName = 'SatisfactoryModManager';

let isDebugMode = process.env.NODE_DEBUG?.includes('SMManagerAPI') || false;

setLogDebug(isDebugMode);

export function isDebug(): boolean {
  return isDebugMode;
}

export function setDebug(shouldDebug: boolean): void {
  isDebugMode = shouldDebug;
  setLogDebug(shouldDebug);
}

export function toggleDebug(): void {
  setDebug(!isDebugMode);
}

export function ensureExists(folder: string): void {
  fs.mkdirSync(folder, { recursive: true });
}

export function dirs(p: string): Array<string> {
  if (fs.existsSync(p)) {
    return fs.readdirSync(p).filter((f) => fs.statSync(path.join(p, f)).isDirectory());
  }
  return [];
}

export const oldAppDataDir = path.join(getDataHome(), oldAppName);

export const appDataDir = path.join(getDataHome(), appName);
ensureExists(appDataDir);
export const cacheDir = path.join(getCacheFolder(), appName);
ensureExists(cacheDir);
export const downloadCacheDir = path.join(cacheDir, 'downloadCache');
ensureExists(downloadCacheDir);
export const modCacheDir = path.join(downloadCacheDir, 'mods');
ensureExists(modCacheDir);
export const smlCacheDir = path.join(downloadCacheDir, 'smlVersions');
ensureExists(smlCacheDir);
export const bootstrapperCacheDir = path.join(downloadCacheDir, 'bootstrapperVersions');
ensureExists(bootstrapperCacheDir);

export const logsDir = path.join(cacheDir, 'logs');
ensureExists(logsDir);

export const manifestsDir = path.join(appDataDir, 'manifests');
ensureExists(manifestsDir);
export const configFolder = path.join(appDataDir, 'configs');
ensureExists(configFolder);


export function deleteFolderRecursive(deletePath: string): void {
  if (fs.existsSync(deletePath)) {
    fs.readdirSync(deletePath).forEach((file) => {
      const curPath = path.join(deletePath, file);
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(deletePath);
  }
}

export function clearCache(): void {
  fs.readdirSync(modCacheDir).forEach((file) => {
    const curPath = path.join(modCacheDir, file);
    if (fs.statSync(curPath).isDirectory()) {
      deleteFolderRecursive(curPath);
    } else {
      fs.unlinkSync(curPath);
    }
  });
  fs.readdirSync(smlCacheDir).forEach((file) => {
    const curPath = path.join(smlCacheDir, file);
    if (fs.statSync(curPath).isDirectory()) {
      deleteFolderRecursive(curPath);
    } else {
      fs.unlinkSync(curPath);
    }
  });
  fs.readdirSync(bootstrapperCacheDir).forEach((file) => {
    const curPath = path.join(bootstrapperCacheDir, file);
    if (fs.statSync(curPath).isDirectory()) {
      deleteFolderRecursive(curPath);
    } else {
      fs.unlinkSync(curPath);
    }
  });
}

export function copyFile(file: string, toDir: string): void {
  ensureExists(toDir);
  fs.copyFileSync(file, path.join(toDir, path.basename(file)));
}

setLogsDir(logsDir);
setLogFileNameFormat(`${appName}-%DATE%.log`);

const DOWNLOAD_ATTEMPTS = 3;

export async function downloadFile(url: string, file: string): Promise<void> {
  let statusCode = 0;
  for (let i = 0; i < DOWNLOAD_ATTEMPTS; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const buffer: Buffer = await request(url, {
        method: 'GET',
        encoding: null,
      });
      ensureExists(path.dirname(file));
      fs.writeFileSync(file, buffer);
      return;
    } catch (e) {
      if (e.name === 'StatusCodeError') {
        e.message = `${e.statusCode} - ${e.options.uri}`;
        delete e.error;
        delete e.response.body;
      }
      debug(e);
      statusCode = e.statusCode;
    }
    debug(`Attempt ${i}/${DOWNLOAD_ATTEMPTS} to download ${url} failed`);
  }
  throw new NetworkError('Could not download file. Please try again later.', statusCode);
}

export async function forEachAsync<T>(array: Array<T>,
  callback: {(value: T, index: number, array: Array<T>): void}): Promise<void> {
  for (let i = 0; i < array.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[i], i, array);
  }
}

export function removeArrayElement<T>(array: Array<T>, element: T): void {
  const index = array.indexOf(element);
  if (index !== -1) {
    array.splice(index, 1);
  }
}

export function removeArrayElementWhere<T>(array: Array<T>,
  condition: (element: T) => boolean): void {
  const toRemove = new Array<T>();
  array.forEach((element) => {
    if (condition(element)) {
      toRemove.push(element);
    }
  });
  toRemove.forEach((element) => {
    removeArrayElement(array, element);
  });
}

export function versionSatisfiesAll(version: string, versionConstraints: Array<string>): boolean {
  return versionConstraints.every((versionConstraint) => satisfies(version, versionConstraint));
}

export function filterObject<V>(object: { [key: string]: V },
  filterFunction: (key: string, value: V) => boolean): { [key: string]: V } {
  const filtered: { [key: string]: V } = {};
  Object.entries(object).filter((entry) => filterFunction(entry[0], entry[1])).forEach((entry) => {
    const key = entry[0];
    const val = entry[1];
    filtered[key] = val;
  });
  return filtered;
}

export function mapObject<U, V>(object: { [key: string]: U },
  mapFunction: (key: string, value: U) => [string, V]): { [key: string]: V } {
  const mapped: { [key: string]: V } = {};
  Object.entries(object).map((entry) => mapFunction(entry[0], entry[1])).forEach((entry) => {
    const key = entry[0];
    const val = entry[1];
    mapped[key] = val;
  });
  return mapped;
}

export function mergeArrays<T>(...arrays: Array<Array<T>>): Array<T> {
  let jointArray: Array<T> = [];

  arrays.forEach((array) => {
    jointArray = [...jointArray, ...array];
  });
  const uniqueArray = jointArray.filter((item, index) => jointArray.indexOf(item) === index);
  return uniqueArray;
}

export async function isRunning(command: string): Promise<boolean> {
  try {
    return processExists(command);
  } catch (e) {
    // fallback to tasklist
    const { platform } = process;
    let cmd = '';
    switch (platform) {
      case 'win32': cmd = `wmic process where caption="${command}" get commandline`; break;
      case 'darwin': cmd = `ps -ax | grep ${command}`; break;
      case 'linux': cmd = 'ps -A'; break;
      default: break;
    }
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).toLowerCase().indexOf(command.toLowerCase()) > -1;
  }
}
