// @ts-nocheck
/* eslint-disable */
export declare global {
  interface Array<T> {
    removeWhere(condition: (element: T) => boolean): void;
    remove(element: T): void;
    async forEachAsync(callback: {(value: T, index: number, array: Array<T>): Promise<void>}): Promise<void>;
  }
}
