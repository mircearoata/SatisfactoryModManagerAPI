import { getDataHome, getCacheFolder } from 'platform-folders';
import path from 'path';
import fs from 'fs';
import request from 'request-promise-native';
import { satisfies } from 'semver';

import SimpleNodeLogger = require('simple-node-logger');

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

const logLevel = process.env.NODE_DEBUG?.includes('SMLauncherAPI') ? 'debug' : 'info';

export function formatDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

export function formatDateTime(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;
}

export function getLogFilePath(): string {
  return path.join(logsDir, `${appName}-${formatDate(new Date())}.log`);
}

const consoleLoggerOpts = {
  level: logLevel,
  timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
};

const fileLoggerOpts = {
  level: logLevel,
  timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
  logFilePath: getLogFilePath(),
};

const logManager = SimpleNodeLogger.createLogManager(consoleLoggerOpts);
let fileAppender = new SimpleNodeLogger.appenders.FileAppender(fileLoggerOpts);
logManager.addAppender(fileAppender);

let log = logManager.createLogger();

function checkRoll(): void {
  const logFile = getLogFilePath();
  const currentLogFile = fileLoggerOpts.logFilePath;
  if (logFile !== currentLogFile) {
    fileAppender.closeWriter();
    fileLoggerOpts.logFilePath = logFile;
    logManager.getAppenders().pop();
    fileAppender = new SimpleNodeLogger.appenders.FileAppender(fileLoggerOpts);
    logManager.addAppender(fileAppender);
    log = logManager.createLogger();
  }
}

export function debug(message: string): void {
  checkRoll();
  log.debug(message);
}

export function info(message: string): void {
  checkRoll();
  log.info(message);
}

export function warn(message: string): void {
  checkRoll();
  log.warn(message);
}

export function error(message: string): void {
  checkRoll();
  log.error(message);
}

export function fatal(message: string): void {
  checkRoll();
  log.fatal(message);
}

export function copyFile(file: string, toDir: string): void {
  ensureExists(toDir);
  fs.copyFileSync(file, path.join(toDir, path.basename(file)));
}

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
