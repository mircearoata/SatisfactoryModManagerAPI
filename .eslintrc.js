module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/recommended', // Out of the box Typescript rules
    'plugin:import/typescript'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: [
    '@typescript-eslint',
    'import'
  ],
  rules: {
    'import/extensions': [
        'error',
        'ignorePackages',
        {
          js: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never'
        }
    ],
    'linebreak-style': 0,
    'dot-notation': 0,
    'import/prefer-default-export': 0,
    'lines-between-class-members': [
      'error',
      'always',
      {
        'exceptAfterSingleLine': true
      }
    ],
    'indent': 0,
    '@typescript-eslint/indent': ['error', 2],
    'no-underscore-dangle': 0,
    'max-len': ['error', {
      code: 150,
      ignoreComments: true,
      ignoreTrailingComments: true,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true
    }]
  },
  settings: {
    'import/extensions': ['.js', '.jsx', '.json', '.ts', '.tsx'],
    'import/resolver': {
      node: [
        '.ts',
        '.tsx'
      ]
    }
  }
};
