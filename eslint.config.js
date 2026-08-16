import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default ts.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // `x == null` — намеренная проверка на null и undefined разом.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      // Ответ API — нетипизированный JSON: приведение к Suggestion осознанное и локализовано в client.ts.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // Сборка, тесты и примеры живут вне tsconfig библиотеки.
    files: ['build.mjs', 'tests/**', 'examples/**', 'eslint.config.js', 'vitest.config.ts'],
    extends: [ts.configs.disableTypeChecked],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', document: 'readonly', window: 'readonly' },
    },
    rules: { 'no-console': 'off', '@typescript-eslint/explicit-function-return-type': 'off' },
  },
  prettier,
);
