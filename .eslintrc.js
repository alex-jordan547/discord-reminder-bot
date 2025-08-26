// Configuration ESLint stricte pour TypeScript - Discord Reminder Bot Phase 6
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: [
    '@typescript-eslint',
    'import',
    'security',
    'promise',
    'unicorn'
  ],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/typescript',
    'plugin:security/recommended',
    'plugin:promise/recommended',
    'plugin:unicorn/recommended'
  ],
  
  // Règles strictes pour assurance qualité ≥90%
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/require-await': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/prefer-readonly': 'error',
    '@typescript-eslint/prefer-readonly-parameter-types': 'off', // Trop strict pour Discord.js
    '@typescript-eslint/restrict-template-expressions': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',

    // Code quality
    'complexity': ['error', 8],
    'max-depth': ['error', 4],
    'max-lines': ['error', 300],
    'max-lines-per-function': ['error', 50],
    'max-params': ['error', 4],
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    
    // Import rules
    'import/no-unresolved': 'error',
    'import/no-cycle': 'error',
    'import/no-unused-modules': 'error',
    'import/order': ['error', {
      'groups': [
        'builtin',
        'external', 
        'internal',
        'parent',
        'sibling',
        'index'
      ],
      'newlines-between': 'always',
      'alphabetize': { order: 'asc', caseInsensitive: true }
    }],

    // Security rules
    'security/detect-object-injection': 'error',
    'security/detect-non-literal-require': 'error',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-eval-with-expression': 'error',

    // Promise rules
    'promise/always-return': 'error',
    'promise/catch-or-return': 'error',
    'promise/no-nesting': 'error',
    'promise/param-names': 'error',

    // Unicorn rules (sélection pour TypeScript)
    'unicorn/prevent-abbreviations': 'off', // Peut être trop strict
    'unicorn/filename-case': ['error', { case: 'camelCase' }],
    'unicorn/no-array-callback-reference': 'off', // Conflict avec TypeScript
    'unicorn/no-null': 'off', // Nécessaire pour Discord.js
    'unicorn/prefer-module': 'off', // Pas toujours applicable
    'unicorn/prefer-node-protocol': 'error',
    'unicorn/consistent-function-scoping': 'error',
    'unicorn/no-useless-undefined': 'error',
    
    // Style consistency
    'indent': 'off', // Handled by TypeScript
    '@typescript-eslint/indent': ['error', 2],
    'quotes': 'off',
    '@typescript-eslint/quotes': ['error', 'single'],
    'semi': 'off',
    '@typescript-eslint/semi': ['error', 'always'],
    'comma-dangle': 'off',
    '@typescript-eslint/comma-dangle': ['error', 'always-multiline'],
    
    // Best practices
    'eqeqeq': ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'arrow-spacing': 'error',
    'no-duplicate-imports': 'error'
  },

  // Configuration per-file pour flexibilité
  overrides: [
    {
      // Tests peuvent être moins stricts
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        'max-lines-per-function': 'off',
        'complexity': ['warn', 15]
      }
    },
    {
      // Configuration files
      files: ['**/*.config.ts', '**/*.config.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'import/no-dynamic-require': 'off'
      }
    },
    {
      // Migration files - plus de flexibilité
      files: ['**/migrations/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        'max-lines': 'off',
        'complexity': ['warn', 15]
      }
    }
  ],

  // Ignorer certains fichiers/dossiers
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.js', // Ignore JS files, focus on TS
    'temp_*',
    '**/*.d.ts'
  ],

  // Configuration des parsers
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json'
      }
    },
    'import/extensions': ['.ts']
  }
};