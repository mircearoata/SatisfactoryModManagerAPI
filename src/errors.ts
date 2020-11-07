/* eslint-disable max-classes-per-file */
export class UnsolvableDependencyError extends Error {
  modID: string;
  constructor(message: string, modID: string) {
    super(message);
    this.modID = modID;
  }
}
export class DependencyManifestMismatchError extends Error {}
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
  modID: string;
  version?: string;
  innerError: Error;
  constructor(message: string, innerError: Error, modID: string, version?: string) {
    super(message);
    this.modID = modID;
    this.version = version;
    this.innerError = innerError;
  }
}
export class InvalidModFileError extends Error {}
export class GameRunningError extends Error {}
export class InvalidProfileError extends Error {}
export class ImcompatibleGameVersion extends Error {}
export class NetworkError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
export class ModRemovedByAuthor extends Error {
  modID: string;
  version?: string;
  constructor(message: string, modID: string, version?: string) {
    super(message);
    this.modID = modID;
    this.version = version;
  }
}
