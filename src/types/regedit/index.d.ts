declare module 'regedit' {
  export interface Value {
    value: string;
    type: string;
  }
  export function list(keys: string | string[],
    callback: (err: Error, result: { [key: string]: { keys: string[]; values: { [valueName: string]: Value} }}) => void): void;
}
