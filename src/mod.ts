/* eslint-disable max-classes-per-file */

export interface Mod {
  mod_id: string;
  name: string;
  version: string;
  description: string;
  authors: Array<string>;
  objects: Array<ModObject>;
  dependencies: object;
  optional_dependencies: object;
}

export interface ModObject {
  path: string;
  type: string;
  metadata: object;
}
