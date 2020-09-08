/* eslint-disable no-console */
/* eslint-disable max-classes-per-file */

import fs from 'fs';
import path from 'path';
import { logsDir, appName } from './paths';

export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
}

abstract class Logger {
  minLevel: LogLevel = LogLevel.INFO;
  abstract write(level: LogLevel, message: string): void;
}

class ConsoleLogger extends Logger {
  constructor(minLevel?: LogLevel) {
    super();
    this.minLevel = minLevel || LogLevel.INFO;
  }

  // eslint-disable-next-line class-methods-use-this
  write(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        console.log(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.INFO:
      default:
        console.info(message);
        break;
    }
  }
}

export function formatDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

class RollingFileLogger extends Logger {
  dir: string;
  fileNameFormat: string;
  private logFileWriter: fs.WriteStream;

  constructor(dir: string, fileNameFormat: string, minLevel?: LogLevel) {
    super();
    this.dir = dir;
    this.fileNameFormat = fileNameFormat;
    this.minLevel = minLevel || LogLevel.DEBUG;
    this.logFileWriter = fs.createWriteStream(this.getLogFilePath(), { flags: 'a', encoding: 'utf8', autoClose: true });
  }

  static formatLogFileName(fileName: string): string {
    return fileName.replace('%DATE%', formatDate(new Date()));
  }

  getLogFilePath(): string {
    return path.join(this.dir, RollingFileLogger.formatLogFileName(this.fileNameFormat));
  }

  checkRoll(): void {
    if (this.logFileWriter.path !== this.getLogFilePath()) {
      this.logFileWriter.end('\n');
      this.logFileWriter = fs.createWriteStream(this.getLogFilePath(), { flags: 'a', encoding: 'utf8', autoClose: true });
      this.logFileWriter.write('\n');
    }
  }

  // eslint-disable-next-line class-methods-use-this
  write(level: LogLevel, message: string): void {
    this.checkRoll();
    if (this.logFileWriter && this.logFileWriter.writable) {
      this.logFileWriter.write(message);
      this.logFileWriter.write('\n');
    }
  }
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

const loggers: Array<Logger> = [new ConsoleLogger(), new RollingFileLogger(logsDir, `${appName}-%DATE%.log`)];

export function write(level: LogLevel, message: string | unknown): void {
  const formattedMessage = formatMessage(level, typeof message === 'string' ? message : JSON.stringify(message));
  loggers.forEach((logger) => {
    if (level >= logger.minLevel) {
      logger.write(level, formattedMessage);
    }
  });
}

export function debug(message: string | unknown): void {
  return write(LogLevel.DEBUG, message);
}

export function info(message: string | unknown): void {
  return write(LogLevel.INFO, message);
}

export function warn(message: string | unknown): void {
  return write(LogLevel.WARN, message);
}

export function error(message: string | Error | unknown): void {
  if (message instanceof Error) {
    return write(LogLevel.ERROR, `${message.message}\nTrace\n${message.stack}`);
  }
  return write(LogLevel.ERROR, message);
}

export function setLogDebug(d: boolean): void {
  loggers[0].minLevel = d ? LogLevel.DEBUG : LogLevel.INFO; // Only change for console logger, file logger should have all debug currently
  info(`Set debug mode to ${d}`);
}

export function toggleLogDebug(): void {
  if (loggers[0].minLevel === LogLevel.DEBUG) {
    setLogDebug(false);
  } else {
    setLogDebug(true);
  }
}

export function getLogFilePath(): string {
  return (loggers[1] as RollingFileLogger).getLogFilePath();
}
