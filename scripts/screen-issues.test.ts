/**
 * Unit tests for the burndown's issue screen. Jev is replaced by a fake
 * grader; nothing here calls the network.
 *
 * Run with: bun test
 */

import { describe, expect, test } from 'bun:test';
import {
  BOUNDS,
  classify,
  type Grader,
  type Issue,
  isTrusted,
  QUESTIONS,
  requestFor,
  screenIssue,
} from './screen-issues';

const labels = { skip: 'auto-fix-skip', optIn: 'auto-fix-ok', audit: 'repo-audit' };

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 7,
    title: 'write-nql retries validation forever',
    body: 'Phase 3 has no retry bound.',
    url: 'https://github.com/o/r/issues/7',
    author: 'someone',
    association: 'MEMBER',
    labels: [],
    createdAt: '2026-09-01T00:00:00Z',
    comments: [],
    ...overrides,
  };
}

function grader(scores: Record<string, number>): Grader {
  return {
    systemOne: () =>
      Promise.resolve({
        answers: Object.fromEntries(Object.entries(scores).map(([id, noul]) => [id, { noul }])),
      }),
  };
}

const allLow = Object.fromEntries(Object.keys(QUESTIONS).map((id) => [id, 0.05]));

describe('isTrusted', () => {
  test('keeps owners, members and collaborators', () => {
    for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
      expect(isTrusted(issue({ association }), labels)).toBe(true);
    }
  });

  test('drops outside authors', () => {
    for (const association of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR']) {
      expect(isTrusted(issue({ association }), labels)).toBe(false);
    }
  });

  test('keeps the audit bot only with the audit label', () => {
    const bot = { author: 'github-actions[bot]', association: 'NONE' };
    expect(isTrusted(issue({ ...bot, labels: ['repo-audit'] }), labels)).toBe(true);
    expect(isTrusted(issue({ ...bot, labels: [] }), labels)).toBe(false);
  });

  test('keeps an outside issue a maintainer opted in', () => {
    expect(isTrusted(issue({ association: 'NONE', labels: ['auto-fix-ok'] }), labels)).toBe(true);
  });
});

describe('classify', () => {
  test('splits at the bounds, inclusive at each lower edge', () => {
    expect(classify(BOUNDS.lower - 0.01)).toBe('pass');
    expect(classify(BOUNDS.lower)).toBe('uncertain');
    expect(classify(BOUNDS.upper - 0.01)).toBe('uncertain');
    expect(classify(BOUNDS.upper)).toBe('flagged');
  });
});

describe('requestFor', () => {
  test('sends title, body and comments as state and every question', () => {
    const req = requestFor(
      issue({ comments: [{ author: 'm', association: 'MEMBER', body: 'also phase 4' }] }),
    );
    expect(req.state.issue.title).toBe('write-nql retries validation forever');
    expect(req.state.issue.comments).toEqual([{ author: 'm', body: 'also phase 4' }]);
    expect(Object.keys(req.questions).sort()).toEqual(Object.keys(QUESTIONS).sort());
  });
});

describe('screenIssue', () => {
  test('passes an issue every question scores low', async () => {
    const screen = await screenIssue(issue(), grader(allLow));
    expect(screen.outcome).toBe('pass');
  });

  test('reports the highest-scoring question', async () => {
    const screen = await screenIssue(
      issue(),
      grader({ ...allLow, 'requests-secrets': 0.92, 'addresses-agent': 0.81 }),
    );
    expect(screen).toEqual({ outcome: 'flagged', pattern: 'requests-secrets', score: 0.92 });
  });

  test('fails closed when an answer is missing', async () => {
    const { 'hidden-content': _dropped, ...partial } = allLow;
    const screen = await screenIssue(issue(), grader(partial));
    expect(screen.outcome).toBe('unscreened');
  });

  test('fails closed when an answer is out of range', async () => {
    const screen = await screenIssue(issue(), grader({ ...allLow, 'addresses-agent': 1.4 }));
    expect(screen.outcome).toBe('unscreened');
  });

  test('fails closed when the call throws', async () => {
    const screen = await screenIssue(issue(), {
      systemOne: () => Promise.reject(new Error('503')),
    });
    expect(screen).toEqual({ outcome: 'unscreened', error: '503' });
  });
});
