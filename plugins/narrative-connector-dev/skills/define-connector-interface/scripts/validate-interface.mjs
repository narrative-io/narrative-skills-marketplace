#!/usr/bin/env node
// Validate the data-contract artifacts /define-connector-interface generates
// against the platform's app-interface contract:
//
//   - a record schema (audience/event metaschema JSON)
//   - a settings-form contract (the quick-settings JSON Schema)
//   - an app-interface payload (one interface object, or the array GET
//     /interfaces returns)
//
// The expected shapes are documented in ../references/interface-anatomy.md.
//
// Usage:
//   validate-interface.mjs <file.json> [more files...] [--spec connector-spec.yaml]
//
// The artifact kind is detected from the JSON shape; pass --kind
// record-schema | form-schema | interface to override. --spec enables
// cross-checks against connector-spec.yaml (identifier groups and quick
// settings); it needs a YAML parser and is skipped with a note when the
// runtime has none (Bun has one built in; plain Node does not).
//
// Runs on Node 18+ or Bun. No dependencies. Exit 0 when every file passes,
// 1 on any error finding.

import { readFileSync } from "node:fs";

// ── The platform's $defs, verbatim ──────────────────────────────────

const ANY_VALUE_TYPE = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["string", "long", "double", "boolean"] },
    display_name: { type: "string" },
  },
  required: ["type"],
};

const STRING_VALUE_TYPE = {
  type: "object",
  properties: {
    type: { type: "string", const: "string" },
    display_name: { type: "string" },
  },
  required: ["type"],
};

const PLATFORM_DEFS = {
  any_value_type: ANY_VALUE_TYPE,
  string_value_type: STRING_VALUE_TYPE,
  attribute_value: {
    type: "object",
    properties: {
      type: { type: "string", const: "object" },
      properties: {
        type: "object",
        properties: { value: { $ref: "#/$defs/any_value_type" } },
        required: ["value"],
      },
    },
    required: ["type", "properties"],
  },
  attribute_typed_value: {
    type: "object",
    properties: {
      type: { const: "object" },
      properties: {
        type: "object",
        properties: {
          value: { $ref: "#/$defs/any_value_type" },
          type: { $ref: "#/$defs/string_value_type" },
        },
        required: ["value", "type"],
      },
    },
    required: ["type", "properties"],
  },
  attribute_context_value: {
    type: "object",
    properties: {
      type: { const: "object" },
      properties: {
        type: "object",
        properties: {
          value: { $ref: "#/$defs/any_value_type" },
          context: { $ref: "#/$defs/string_value_type" },
        },
        required: ["value", "context"],
      },
    },
    required: ["type", "properties"],
  },
};

const REF_KINDS = [
  "attribute_value",
  "attribute_typed_value",
  "attribute_context_value",
  "string_value_type",
];

const ATTRIBUTE_URI = /^https:\/\/api\.narrative\.io\/attributes\/[a-z0-9_]+$/;
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const ISO_DURATION = /^P(?=.)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=.)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;

// ── Findings ────────────────────────────────────────────────────────

const findings = [];
let currentFile = "";

function error(path, message) {
  findings.push({ level: "ERROR", file: currentFile, path, message });
}

function warn(path, message) {
  findings.push({ level: "WARN", file: currentFile, path, message });
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepEqual(a, b) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (!isObject(v)) return v;
  return Object.fromEntries(
    Object.keys(v)
      .sort()
      .map((k) => [k, sortKeys(v[k])]),
  );
}

// ── Record schema (metaschema) ──────────────────────────────────────

function validateRecordSchema(doc, path = "") {
  const p = (s) => (path ? `${path}.${s}` : s);

  if (doc.type !== "object") error(p("type"), 'must be "object"');
  if (!Array.isArray(doc.required) || !doc.required.includes("properties"))
    error(p("required"), 'must include "properties"');

  const outer = doc.properties?.properties;
  if (!isObject(outer)) {
    error(p("properties.properties"), "missing — the record schema nests properties inside properties (it validates a dataset's schema, one meta-level up)");
    return;
  }

  const props = outer.properties;
  if (!isObject(props) || Object.keys(props).length === 0) {
    error(p("properties.properties.properties"), "no identifier properties declared");
    return;
  }

  for (const [name, entry] of Object.entries(props)) {
    const ep = p(`properties.properties.properties.${name}`);
    if (!SNAKE_CASE.test(name)) warn(ep, "property name is not snake_case");
    if (!isObject(entry)) {
      error(ep, "must be an object");
      continue;
    }
    const ref = entry.$ref;
    const kind = typeof ref === "string" && ref.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : null;
    if (!kind || !REF_KINDS.includes(kind))
      error(`${ep}.$ref`, `must be #/$defs/<ref_kind> with ref_kind one of ${REF_KINDS.join(", ")} (got ${JSON.stringify(ref)})`);
    if (typeof entry.attribute !== "string") error(`${ep}.attribute`, "missing attribute URI annotation");
    else if (!ATTRIBUTE_URI.test(entry.attribute))
      warn(`${ep}.attribute`, `does not look like a canonical Rosetta URI: ${entry.attribute}`);
  }

  if (!("narrative_id" in props)) warn(p("properties.properties.properties"), "no narrative_id property — every spec carries a narrative_id identifier group");

  const anyOf = outer.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length === 0) {
    error(p("properties.properties.anyOf"), "missing acceptance policy — at least one anyOf entry is required");
  } else {
    anyOf.forEach((entry, i) => {
      const ap = p(`properties.properties.anyOf[${i}]`);
      if (!isObject(entry) || !Array.isArray(entry.required) || entry.required.length === 0) {
        error(ap, 'each acceptance-policy entry must be {"required": [<identifier names>]}');
        return;
      }
      for (const name of entry.required)
        if (!(name in props)) error(ap, `requires undeclared identifier "${name}"`);
    });
  }

  const defs = doc.$defs;
  if (!isObject(defs)) {
    error(p("$defs"), "missing — copy the platform $defs block verbatim");
    return;
  }
  const usedKinds = new Set(
    Object.values(props)
      .map((e) => (typeof e?.$ref === "string" ? e.$ref.slice("#/$defs/".length) : null))
      .filter((k) => REF_KINDS.includes(k)),
  );
  for (const kind of usedKinds) {
    if (!(kind in defs)) {
      error(p(`$defs.${kind}`), "referenced by a property but not defined");
      continue;
    }
    if (!deepEqual(defs[kind], PLATFORM_DEFS[kind]))
      error(p(`$defs.${kind}`), "differs from the platform shape — the $defs block is the platform's and is never edited per connector");
  }
  const needsAnyValue = [...usedKinds].some((k) => k !== "string_value_type");
  if (needsAnyValue && !deepEqual(defs.any_value_type, PLATFORM_DEFS.any_value_type))
    error(p("$defs.any_value_type"), "missing or differs from the platform shape");
  const typedOrContext = [...usedKinds].some((k) => k === "attribute_typed_value" || k === "attribute_context_value");
  if (typedOrContext && !deepEqual(defs.string_value_type, PLATFORM_DEFS.string_value_type))
    error(p("$defs.string_value_type"), "missing or differs from the platform shape (attribute_typed_value and attribute_context_value depend on it)");
}

// ── Settings-form contract (quick-settings schema) ──────────────────

function validateFormSchema(doc, path = "") {
  const p = (s) => (path ? `${path}.${s}` : s);

  const t = doc.type;
  if (!isObject(t)) {
    error(p("type"), 'must be the discriminator block {"type": "string", "const": ..., "default": ..., "readOnly": true} (the platform overloads the top-level type keyword)');
  } else {
    if (t.type !== "string") error(p("type.type"), 'must be "string"');
    if (typeof t.const !== "string" || t.const.length === 0) error(p("type.const"), "must be the non-empty discriminator string");
    if (t.default !== t.const) error(p("type.default"), `must equal type.const (${JSON.stringify(t.const)})`);
    if (t.readOnly !== true) error(p("type.readOnly"), "must be true");
  }

  const props = doc.properties;
  if (!isObject(props)) {
    error(p("properties"), "missing field properties");
    return;
  }
  for (const name of Object.keys(props))
    if (!SNAKE_CASE.test(name)) warn(p(`properties.${name}`), "field name is not snake_case");

  if (doc.required !== undefined) {
    if (!Array.isArray(doc.required)) error(p("required"), "must be an array of field names");
    else for (const name of doc.required) if (!(name in props)) error(p("required"), `lists undeclared field "${name}"`);
  }

  if (doc.anyOf !== undefined && !Array.isArray(doc.anyOf)) error(p("anyOf"), "must be an array");

  if (doc.uischema !== undefined) {
    const scopes = [];
    collectScopes(doc.uischema, scopes);
    for (const scope of scopes) {
      const m = /^#\/properties\/([^/]+)$/.exec(scope);
      if (m && !(m[1] in props))
        error(p("uischema"), `Control scope ${scope} points at a field the schema does not declare`);
    }
  }
}

function collectScopes(node, out) {
  if (Array.isArray(node)) return node.forEach((n) => collectScopes(n, out));
  if (!isObject(node)) return;
  if (typeof node.scope === "string") out.push(node.scope);
  for (const v of Object.values(node)) collectScopes(v, out);
}

// ── App interface payload ───────────────────────────────────────────

function validateInterface(doc, path = "") {
  const p = (s) => (path ? `${path}.${s}` : s);

  if (typeof doc.id !== "string" || doc.id.length === 0) error(p("id"), "must be a non-empty string");
  if (typeof doc.name !== "string" || doc.name.length === 0) error(p("name"), "must be a non-empty string");

  if (!isObject(doc.metadata)) {
    error(p("metadata"), "missing");
  } else {
    if (!Array.isArray(doc.metadata.tags)) error(p("metadata.tags"), "must be an array of strings");
    const rs = doc.metadata.refresh_schedule;
    if (rs !== undefined && rs !== null) {
      for (const bound of ["min", "max"])
        if (rs[bound] !== undefined && rs[bound] !== null && !ISO_DURATION.test(rs[bound]))
          error(p(`metadata.refresh_schedule.${bound}`), `must be an ISO-8601 duration like P180D (got ${JSON.stringify(rs[bound])})`);
    }
  }

  if (!isObject(doc.schema)) {
    error(p("schema"), "missing quick-settings schema");
  } else {
    validateFormSchema(doc.schema, p("schema"));
    const disc = doc.schema.type?.const;
    if (typeof disc === "string" && disc !== doc.id)
      warn(p("schema.type.const"), `discriminator ${JSON.stringify(disc)} differs from interface id ${JSON.stringify(doc.id)} (the framework serves them equal)`);
  }

  const policy = doc.policy;
  if (policy !== undefined && policy !== null) {
    if (!isObject(policy)) {
      error(p("policy"), "must be an object when present");
    } else {
      // A served policy is the record schema plus the framework's
      // {name, hash} annotation; strip the annotation before checking.
      const { name, hash, ...rest } = policy;
      if (name !== undefined && typeof name !== "string") error(p("policy.name"), "must be a string");
      if (hash !== undefined && typeof hash !== "number") error(p("policy.hash"), "must be a number");
      validateRecordSchema(rest, p("policy"));
    }
  }
}

// ── Kind detection ──────────────────────────────────────────────────

function detectKind(doc) {
  if (Array.isArray(doc)) return "interface-list";
  if (!isObject(doc)) return null;
  if (isObject(doc.schema) && typeof doc.id === "string") return "interface";
  if (isObject(doc.properties?.properties) || isObject(doc.$defs)) return "record-schema";
  if (isObject(doc.type) && typeof doc.type.const === "string") return "form-schema";
  if (isObject(doc.properties)) return "form-schema";
  return null;
}

// ── Spec cross-check (optional; needs a YAML runtime) ───────────────

function loadSpec(specPath) {
  const text = readFileSync(specPath, "utf8");
  const yaml = globalThis.Bun?.YAML;
  if (!yaml) {
    console.log(`SKIP: spec cross-check (${specPath}) — no YAML parser in this runtime; run under Bun to enable it`);
    return null;
  }
  return yaml.parse(text);
}

function crossCheckSpec(spec, docs) {
  currentFile = "(spec cross-check)";
  const groups = spec?.identifier_groups ?? [];
  const quickSettings = spec?.quick_settings ?? [];

  for (const { doc, kind, file } of docs) {
    if (kind === "record-schema") {
      const props = doc.properties?.properties?.properties ?? {};
      for (const group of groups) {
        const entry = props[group.name];
        if (!entry) {
          warn(file, `spec identifier group "${group.name}" has no property in this record schema (expected unless the schema serves a direction that excludes it)`);
          continue;
        }
        const expected = `#/$defs/${group.ref_kind}`;
        if (entry.$ref !== expected)
          error(file, `"${group.name}": $ref is ${JSON.stringify(entry.$ref)} but the spec's ref_kind demands ${expected}`);
        if (typeof group.attribute === "string" && entry.attribute !== group.attribute)
          error(file, `"${group.name}": attribute URI ${JSON.stringify(entry.attribute)} differs from the spec's ${JSON.stringify(group.attribute)}`);
      }
    }

    const interfaces = kind === "interface-list" ? doc : kind === "interface" ? [doc] : [];
    for (const qs of quickSettings) {
      const match = interfaces.find((i) => i?.schema?.type?.const === qs.type);
      if (interfaces.length > 0 && !match) {
        error(file, `spec quick-settings type "${qs.type}" has no interface with that discriminator`);
        continue;
      }
      if (!match) continue;
      const props = match.schema?.properties ?? {};
      for (const field of qs.fields ?? []) {
        if (!(field.name in props)) error(file, `"${qs.type}": spec field "${field.name}" is missing from the interface schema`);
        else if (field.required === true && !(match.schema.required ?? []).includes(field.name))
          warn(file, `"${qs.type}": spec marks "${field.name}" required but the interface schema does not`);
      }
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────

function main(argv) {
  const files = [];
  let specPath = null;
  let kindOverride = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--spec") specPath = argv[++i];
    else if (arg === "--kind") kindOverride = argv[++i];
    else files.push(arg);
  }

  if (files.length === 0) {
    console.error("usage: validate-interface.mjs <file.json> [more files...] [--kind record-schema|form-schema|interface] [--spec connector-spec.yaml]");
    return 2;
  }

  const docs = [];
  for (const file of files) {
    currentFile = file;
    let doc;
    try {
      doc = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      error("", `not readable as JSON: ${e.message}`);
      continue;
    }
    const kind = kindOverride ?? detectKind(doc);
    if (!kind) {
      error("", "could not detect the artifact kind; pass --kind");
      continue;
    }
    docs.push({ doc, kind, file });
    if (kind === "record-schema") validateRecordSchema(doc);
    else if (kind === "form-schema") validateFormSchema(doc);
    else if (kind === "interface") validateInterface(doc);
    else if (kind === "interface-list") doc.forEach((entry, i) => validateInterface(entry, `[${i}]`));
  }

  if (specPath) {
    const spec = loadSpec(specPath);
    if (spec) crossCheckSpec(spec, docs);
  }

  for (const f of findings) console.log(`${f.level} ${f.file}${f.path ? ` ${f.path}` : ""}: ${f.message}`);
  const errors = findings.filter((f) => f.level === "ERROR").length;
  const warns = findings.length - errors;
  console.log(`${errors} error(s), ${warns} warning(s) across ${files.length} file(s)`);
  return errors > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
