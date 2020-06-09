declare module 'vdf' {
  export function parse(string: string): unknown;
  export function dump(string: unknown): string;
}
