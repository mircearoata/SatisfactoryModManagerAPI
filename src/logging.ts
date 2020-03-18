/* eslint-disable no-console */
/* eslint-disable max-classes-per-file */

import fs from 'fs';
import path from 'path';

export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
}

let minLogLevel = LogLevel.INFO;

let logsDir = '.';
let logFileNameFormat = 'logging.log';

export function setLogsDir(dir: string): void {
  logsDir = dir;
}

export function setLogFileNameFormat(fileNameFormat: string): void {
  logFileNameFormat = fileNameFormat;
}

export function formatDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

export function formatDateTime(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}:${date.getMilliseconds().toString().padStart(3, '0')}`;
}

function levelToString(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return 'DEBUG';
    case LogLevel.INFO:
      return 'INFO';
    case LogLevel.WARN:
      return 'WARN';
    case LogLevel.ERROR:
      return 'ERROR';
    default:
      return '';
  }
}

function formatMessage(level: LogLevel, message: string): string {
  return `${formatDateTime(new Date())}\t[${levelToString(level)}]\t${message}`;
}

function formatLogFileName(fileName: string): string {
  return fileName.replace('%DATE%', formatDate(new Date()));
}

export function getLogFilePath(): string {
  return path.join(logsDir, formatLogFileName(logFileNameFormat));
}

let logFilePath = '';
let logFileWriter: fs.WriteStream;

function checkRoll(): void {
  if (logFilePath !== getLogFilePath()) {
    logFilePath = getLogFilePath();
    if (logFileWriter) {
      logFileWriter.end('\n');
    }
    logFileWriter = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf-8', autoClose: true });
    logFileWriter.write('\n');
  }
}

function write(level: LogLevel, message: string | object): void {
  if (level >= minLogLevel) {
    const formattedMessage = formatMessage(level, typeof message === 'string' ? message : JSON.stringify(message));
    switch (level) {
      case LogLevel.DEBUG:
        console.log(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        console.trace();
        break;
      case LogLevel.INFO:
      default:
        console.info(formattedMessage);
        break;
    }
    checkRoll();
    if (logFileWriter && logFileWriter.writable) {
      logFileWriter.write(formattedMessage);
      logFileWriter.write('\n');
    }
  }
}

export function debug(message: string | object): void {
  return write(LogLevel.DEBUG, message);
}

export function info(message: string | object): void {
  return write(LogLevel.INFO, message);
}

export function warn(message: string | object): void {
  return write(LogLevel.WARN, message);
}

export function error(message: string | object): void {
  return write(LogLevel.ERROR, message);
}

export function setLogDebug(d: boolean): void {
  minLogLevel = d ? LogLevel.DEBUG : LogLevel.INFO;
  info(`Set debug mode to ${d}`);
}

export function toggleLogDebug(): void {
  if (minLogLevel === LogLevel.DEBUG) {
    setLogDebug(false);
  } else {
    setLogDebug(true);
  }
}
