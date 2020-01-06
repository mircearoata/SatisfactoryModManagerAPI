import { getDataHome, getCacheFolder } from 'platform-folders';
import path from 'path';
import fs from 'fs';
import request from 'request-promise-native';
import { satisfies } from 'semver';

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

export function copyFile(file: string, toDir: string): void {
  ensureExists(toDir);
  fs.copyFileSync(file, path.join(toDir, path.basename(file)));
}

export async function downloadFile(url: string, file: string): Promise<void> {
  const buffer: Buffer = await request(url, {
    method: 'GET',
    encoding: null,
  });
  fs.writeFileSync(file, buffer);
}

export async function forEachAsync<T>(array: Array<T>,
  callback: {(value: T, index: number, array: T[]): void}): Promise<void> {
  await Promise.all(array.map(callback));
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
