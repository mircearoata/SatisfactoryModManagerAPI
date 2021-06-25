/* eslint-disable max-classes-per-file */
export class UnsolvableDependencyError extends Error {
  item: string;
  constructor(message: string, modID: string) {
    super(message);
    this.item = modID;
  }
}
export class DependencyManifestMismatchError extends Error {
  item: string;
  dependants: {id: string, constraint: string}[];
  constructor(message: string, item: string, depenants: {id: string, constraint: string}[]) {
    super(message);
    this.item = item;
    this.dependants = depenants;
  }
}
export class InvalidLockfileOperation extends Error {}
export class ModNotFoundError extends Error {
  modID: string;
  version?: string;
  constructor(message: string, modID: string, version?: string) {
    super(message);
    this.modID = modID;
    this.version = version;
  }
}
export class ValidationError extends Error {
  item: string;
  version?: string;
  innerError: Error;
  constructor(message: string, innerError: Error, item: string, version?: string) {
    super(message);
    this.item = item;
    this.version = version;
    this.innerError = innerError;
  }
}
export class InvalidModFileError extends Error {}
export class GameRunningError extends Error {}
export class InvalidProfileError extends Error {}
export class IncompatibleGameVersion extends Error {}
export class NetworkError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
export class ModRemovedByAuthor extends Error {
  item: string;
  version?: string;
  constructor(message: string, item: string, version?: string) {
    super(message);
    this.item = item;
    this.version = version;
  }
}
export class SetupError extends Error {}
