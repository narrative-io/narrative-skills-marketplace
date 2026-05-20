/**
 * Commitlint configuration.
 *
 * Enforced both locally (via the lefthook commit-msg hook — see
 * lefthook.yml) and at PR-time (via the semantic-pull-request action
 * in .github/workflows/pr-title.yml). Keep the rules below aligned
 * with the workflow's `types` list so contributors get consistent
 * feedback either way.
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'perf',
        'refactor',
        'docs',
        'ci',
        'build',
        'chore',
        'test',
        'revert',
        'style',
      ],
    ],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
  },
};
