// @ts-nocheck
/* eslint-disable */
/// <reference lib="dom" />

export declare global {
  interface Array<T> {
    removeWhere(condition: (element: T) => boolean): void;
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