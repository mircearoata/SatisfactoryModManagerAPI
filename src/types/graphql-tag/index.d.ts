import { DefinitionNode, Location } from 'graphql';

export interface DocumentNode<D = unknown, V = unknown> {
  readonly kind: 'Document';
  readonly loc?: Location;
  readonly definitions: ReadonlyArray<DefinitionNode>;
}
declare const _default: <D = unknown, V = unknown>(
  literals: unknown,
  ...placeholders: unknown[]
) => DocumentNode<D, V>;
export default _default;
declare module 'graphql' {
  interface DocumentNode<D = unknown, V = unknown> {
    readonly kind: 'Document';
    readonly loc?: Location;
    readonly definitions: ReadonlyArray<DefinitionNode>;
  }
}
declare module 'graphql-tag' {
  export default function gql<D = unknown, V = unknown>(
    literals: unknown,
    ...placeholders: unknown[]
  ): DocumentNode<D, V>;
  function resetCaches(): void;
  function disableFragmentWarnings(): void;
}
