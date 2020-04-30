// @ts-nocheck
/* eslint-disable */
/// <reference lib="dom" />

export declare global {
  interface Array<T> {
    removeWhere(predicate: (value: T, index: number, array: Array<T>) => boolean): void;
    removeWhereAsync(predicate: (value: T, index: number, array: Array<T>) => Promise<boolean>): Promise<void>;
    filterAsync(predicate: (value: T, index: number, array: Array<T>) => Promise<boolean>): Promise<Array<T>>;
    remove(element: T): void;
    forEachAsync(callback: {(value: T, index: number, array: Array<T>): Promise<void>}): Promise<void>;
  }
  type JSONReviver = (key: unknown, value: unknown) => unknown;

  interface JSON {
    globalRevivers: JSONReviver[];
    addGlobalReviver(reviver: JSONReviver): void;
    reviveGlobals: JSONReviver;
  }

  namespace NodeJS {
    interface Global {
      fetch: typeof fetch;
    }
  }  
}