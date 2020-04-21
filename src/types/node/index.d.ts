// @ts-nocheck
/* eslint-disable */
export declare global {
  interface Array<T> {
    removeWhere(condition: (element: T) => boolean): void;
    remove(element: T): void;
    async forEachAsync(callback: {(value: T, index: number, array: Array<T>): Promise<void>}): Promise<void>;
  }
  type JSONReviver = (key: unknown, value: unknown) => unknown;

  interface JSON {
    globalRevivers: JSONReviver[];
    addGlobalReviver(reviver: JSONReviver): void;
    reviveGlobals: JSONReviver;
  }
}
