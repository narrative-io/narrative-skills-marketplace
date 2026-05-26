/**
 * Unit tests for the generalized skill-docs renderer.
 *
 * Each test sets up a tmp dir mirroring `plugins/<plugin>/skills/<skill>/`
 * plus a `snippets/` dir for repo-shared snippets, writes one or more
 * `*.tmpl` fixtures, and calls processTemplate(tmplPath, root) directly.
 *
 * Run with: bun test scripts/__tests__/gen-skill-docs.test.ts
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bannerFor, isOptOut, OPT_OUT_MARKER, processTemplate } from '../gen-skill-docs';

type Files = Record<string, string>;

function makeFixture(files: Files): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-skill-docs-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('processTemplate', () => {
  test('renders SKILL.md.tmpl with frontmatter banner inserted after the closing ---', () => {
    const { root, cleanup } = makeFixture({
      'snippets/hello.md': 'Hello, world.',
      'plugins/p1/skills/s1/SKILL.md.tmpl':
        '---\nname: s1\nversion: 0.1.0\ndescription: A test skill.\n---\n\n# Body\n\n{{SNIPPET:hello}}\n',
    });
    try {
      const tmplPath = path.join(root, 'plugins/p1/skills/s1/SKILL.md.tmpl');
      const result = processTemplate(tmplPath, root);
      expect(result.kind).toBe('rendered');
      if (result.kind !== 'rendered') {
        return;
      }
      expect(result.outputPath).toBe(path.join(root, 'plugins/p1/skills/s1/SKILL.md'));
      expect(result.content).toContain('---\nname: s1');
      expect(result.content).toContain(
        '<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->',
      );
      expect(result.content).toContain('Hello, world.');
      // Banner must appear AFTER the closing --- of the frontmatter block.
      const bannerIdx = result.content.indexOf('<!-- AUTO-GENERATED');
      const closingFmIdx = result.content.indexOf('---\n', 4); // after `---\nname:` opening
      expect(bannerIdx).toBeGreaterThan(closingFmIdx);
    } finally {
      cleanup();
    }
  });

  test('renders references/*.md.tmpl with banner at the top (no frontmatter)', () => {
    const { root, cleanup } = makeFixture({
      'snippets/askuserquestion-fallback.md':
        'If the harness does not expose `AskUserQuestion`, ask in plain prose.',
      'plugins/p1/skills/s1/references/HARNESS_FALLBACK.md.tmpl':
        '# Harness fallbacks\n\n## When AskUserQuestion is unavailable\n\n{{SNIPPET:askuserquestion-fallback}}\n',
    });
    try {
      const tmplPath = path.join(root, 'plugins/p1/skills/s1/references/HARNESS_FALLBACK.md.tmpl');
      const result = processTemplate(tmplPath, root);
      expect(result.kind).toBe('rendered');
      if (result.kind !== 'rendered') {
        return;
      }
      expect(result.outputPath).toMatch(/HARNESS_FALLBACK\.md$/);
      // Banner must be the very first lines of the rendered content.
      expect(result.content.startsWith('<!-- AUTO-GENERATED')).toBe(true);
      expect(result.content).toContain(
        'If the harness does not expose `AskUserQuestion`, ask in plain prose.',
      );
      // The literal placeholder must not remain.
      expect(result.content).not.toContain('{{SNIPPET:askuserquestion-fallback}}');
    } finally {
      cleanup();
    }
  });

  test('renders assets/*.yaml.tmpl with YAML-style # banner and substitutes placeholders', () => {
    const { root, cleanup } = makeFixture({
      'snippets/dataset-name.md': 'my_dataset',
      'plugins/p1/skills/s1/assets/example.yaml.tmpl':
        'name: example\ndataset: {{SNIPPET:dataset-name}}\n',
    });
    try {
      const tmplPath = path.join(root, 'plugins/p1/skills/s1/assets/example.yaml.tmpl');
      const result = processTemplate(tmplPath, root);
      expect(result.kind).toBe('rendered');
      if (result.kind !== 'rendered') {
        return;
      }
      expect(result.outputPath).toMatch(/example\.yaml$/);
      expect(result.content).toContain('# AUTO-GENERATED from example.yaml.tmpl');
      expect(result.content).not.toContain('<!--');
      expect(result.content).toContain('dataset: my_dataset');
    } finally {
      cleanup();
    }
  });

  test('JSON template renders without banner and warns to stderr', () => {
    const { root, cleanup } = makeFixture({
      'plugins/p1/skills/s1/assets/data.json.tmpl': '{ "ok": true }\n',
    });
    try {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnings.push(msg);
      try {
        const tmplPath = path.join(root, 'plugins/p1/skills/s1/assets/data.json.tmpl');
        const result = processTemplate(tmplPath, root);
        expect(result.kind).toBe('rendered');
        if (result.kind !== 'rendered') {
          return;
        }
        expect(result.content).toBe('{ "ok": true }\n');
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toContain('no banner written');
        expect(warnings[0]).toContain('.json');
      } finally {
        console.warn = originalWarn;
      }
    } finally {
      cleanup();
    }
  });

  test('opt-out marker (YAML) skips rendering', () => {
    const { root, cleanup } = makeFixture({
      'plugins/p1/skills/s1/assets/runtime.yaml.tmpl': `# ${OPT_OUT_MARKER}\nname: example\nstep_1: <RUN_SLUG_KEBAB>\n`,
    });
    try {
      const tmplPath = path.join(root, 'plugins/p1/skills/s1/assets/runtime.yaml.tmpl');
      const result = processTemplate(tmplPath, root);
      expect(result.kind).toBe('skipped');
      if (result.kind !== 'skipped') {
        return;
      }
      expect(result.reason).toBe('opt-out marker');
    } finally {
      cleanup();
    }
  });

  test('opt-out marker (markdown HTML comment) skips rendering', () => {
    const { root, cleanup } = makeFixture({
      'plugins/p1/skills/s1/references/RAW.md.tmpl': `<!-- ${OPT_OUT_MARKER} -->\n# Raw content\n\n{{NOT_A_REAL_RESOLVER}}\n`,
    });
    try {
      const tmplPath = path.join(root, 'plugins/p1/skills/s1/references/RAW.md.tmpl');
      const result = processTemplate(tmplPath, root);
      expect(result.kind).toBe('skipped');
      if (result.kind !== 'skipped') {
        return;
      }
      expect(result.reason).toBe('opt-out marker');
    } finally {
      cleanup();
    }
  });

  test('runtime-macro YAML with opt-out marker preserves <ANGLE_BRACKET> macros untouched', () => {
    const sourceContent =
      `# ${OPT_OUT_MARKER}\n` +
      'name: <RUN_SLUG_KEBAB>\n' +
      'description: <REPORT_DISPLAY_NAME>\n' +
      'steps:\n' +
      '  - id: step_1\n' +
      '    nql: SELECT * FROM company_data.<RUN_SLUG_LOWER>\n';
    const { root, cleanup } = makeFixture({
      'plugins/p1/skills/s1/assets/workflow.yaml.tmpl': sourceContent,
    });
    try {
      const tmplPath = path.join(root, 'plugins/p1/skills/s1/assets/workflow.yaml.tmpl');
      const result = processTemplate(tmplPath, root);
      expect(result.kind).toBe('skipped');
      // Source must remain byte-identical on disk.
      const onDisk = fs.readFileSync(tmplPath, 'utf-8');
      expect(onDisk).toBe(sourceContent);
    } finally {
      cleanup();
    }
  });

  test('unresolved {{...}} placeholder raises a descriptive error', () => {
    const { root, cleanup } = makeFixture({
      'plugins/p1/skills/s1/references/X.md.tmpl': '# X\n{{NOT_REGISTERED}}\n',
    });
    try {
      const tmplPath = path.join(root, 'plugins/p1/skills/s1/references/X.md.tmpl');
      expect(() => processTemplate(tmplPath, root)).toThrow(/Unknown placeholder/);
    } finally {
      cleanup();
    }
  });
});

describe('bannerFor', () => {
  test('returns HTML-comment banner for .md output', () => {
    const banner = bannerFor('/tmp/x.md', 'x.md.tmpl');
    expect(banner).toContain('<!--');
    expect(banner).toContain('-->');
    expect(banner).toContain('AUTO-GENERATED from x.md.tmpl');
  });

  test('returns # banner for .yaml output (no closing token)', () => {
    const banner = bannerFor('/tmp/x.yaml', 'x.yaml.tmpl');
    expect(banner).toContain('# AUTO-GENERATED from x.yaml.tmpl');
    expect(banner).not.toContain('<!--');
    expect(banner).not.toContain('-->');
  });

  test('returns # banner for .yml output', () => {
    const banner = bannerFor('/tmp/x.yml', 'x.yml.tmpl');
    expect(banner).toContain('# AUTO-GENERATED');
  });

  test('returns null for extensions with no known comment syntax', () => {
    expect(bannerFor('/tmp/x.json', 'x.json.tmpl')).toBeNull();
    expect(bannerFor('/tmp/x.txt', 'x.txt.tmpl')).toBeNull();
  });
});

describe('isOptOut', () => {
  test('matches YAML-style marker on first non-blank line', () => {
    expect(isOptOut(`# ${OPT_OUT_MARKER}\nname: x\n`)).toBe(true);
    expect(isOptOut(`\n\n# ${OPT_OUT_MARKER}\nname: x\n`)).toBe(true);
  });

  test('matches markdown HTML-comment marker', () => {
    expect(isOptOut(`<!-- ${OPT_OUT_MARKER} -->\n# Title\n`)).toBe(true);
  });

  test('does NOT match when marker is not first', () => {
    expect(isOptOut(`# something else\n# ${OPT_OUT_MARKER}\n`)).toBe(false);
  });

  test('does NOT match unrelated YAML comments', () => {
    expect(isOptOut('# regular yaml comment\nname: x\n')).toBe(false);
    expect(isOptOut('---\nname: x\n---\n')).toBe(false);
  });
});
