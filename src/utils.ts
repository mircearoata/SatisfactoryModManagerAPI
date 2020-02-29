import { getDataHome, getCacheFolder } from 'platform-folders';
import path from 'path';
import fs from 'fs';
import request from 'request-promise-native';
import { satisfies } from 'semver';
import { setLogsDir, setLogFileNameFormat } from './logging';

export const appName = 'SatisfactoryModLauncher';

export function ensureExists(folder: string): void {
  fs.mkdirSync(folder, { recursive: true });
}

export const appDataDir = path.join(getDataHome(), appName);
ensureExists(appDataDir);
export const cacheDir = path.join(getCacheFolder(), appName);
ensureExists(cacheDir);
export const modCacheDir = path.join(cacheDir, 'mods');
ensureExists(modCacheDir);

export const logsDir = path.join(cacheDir, 'logs');
ensureExists(logsDir);

export function copyFile(file: string, toDir: string): void {
  ensureExists(toDir);
  fs.copyFileSync(file, path.join(toDir, path.basename(file)));
}

setLogsDir(logsDir);
setLogFileNameFormat(`${appName}-%DATE%.log`);

export async function downloadFile(url: string, file: string): Promise<void> {
  const buffer: Buffer = await request(url, {
    method: 'GET',
    encoding: null,
  });
  ensureExists(path.dirname(file));
  fs.writeFileSync(file, buffer);
}

export async function forEachAsync<T>(array: Array<T>,
  callback: {(value: T, index: number, array: T[]): void}): Promise<void> {
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
