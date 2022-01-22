/* eslint-disable no-console */
/* eslint-disable max-classes-per-file */

export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
}

interface Logger {
  write(level: LogLevel, message: string): void;
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

function formatMessage(message: string | unknown): string {
  if (message instanceof Error) {
    return `${message.message}\nTrace\n${message.stack}`;
  }
  if (typeof message === 'string') {
    return message;
  }
  return JSON.stringify(message);
}

const loggers: Array<Logger> = [];

export function addLogger(logger: Logger): void {
  if (!loggers.includes(logger)) {
    loggers.push(logger);
  }
}

export function removeLogger(logger: Logger): void {
  loggers.remove(logger);
}

export function write(level: LogLevel, ...messages: Array<string | unknown>): void {
  const formattedMessage = messages.map(formatMessage).join(' ');
  loggers.forEach((logger) => {
    logger.write(level, `${formatDateTime(new Date())}\t[${levelToString(level)}]\t${formattedMessage}`);
  });
}

export function debug(...messages: Array<string | unknown>): void {
  return write(LogLevel.DEBUG, ...messages);
}

export function info(...messages: Array<string | unknown>): void {
  return write(LogLevel.INFO, ...messages);
}

export function warn(...messages: Array<string | unknown>): void {
  return write(LogLevel.WARN, ...messages);
}

export function error(...messages: Array<string | unknown>): void {
  return write(LogLevel.ERROR, ...messages);
}
