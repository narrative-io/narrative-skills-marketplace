#!/usr/bin/env bash
#
# Build and publish an agent-loop sandbox skills bundle: a release from a tag, or a snapshot of any
# branch or commit pinned to one company.
#
# Produces the two objects the control-plane activity worker consumes (SC-60258):
#   s3://narrative-agent-skills-bundles-<stage>/skills/<version>/bundle.tar.gz
#   s3://narrative-agent-skills-bundles-<stage>/skills/<version>/skills.json
#
# After a release upload, set helm activityWorker.sandbox.skillsBundleVersion = <version> and deploy.
# A snapshot is published as snapshot-<short-sha> and pinned in skills/_overrides/company-<id>.json;
# the worker picks the pin up within a minute, for allowlisted companies only (SC-77080).
#
# Checks out the tag or commit, builds, uploads, then restores your branch on exit, even on failure.
# Refuses to run with a dirty working tree.
#
# Usage:
#   scripts/publish-sandbox-bundle.sh <tag> <stage> [version]
#     tag      git tag to build from, e.g. v2026.05.0
#     stage    dev | prod
#     version  S3 path segment + helm skillsBundleVersion (default: <tag> without a leading 'v')
#
#   scripts/publish-sandbox-bundle.sh --ref <branch-or-sha> --stage <stage> --company <id>
#     publishes the ref as snapshot-<short-sha> and pins company <id> to it
#
#   scripts/publish-sandbox-bundle.sh --stage <stage> --company <id> --clear
#     deletes company <id>'s pin
#
#   DRY_RUN=1 scripts/publish-sandbox-bundle.sh ...   # build + pack, skip the S3 upload and the pin

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: scripts/publish-sandbox-bundle.sh <tag> <stage> [version]
       scripts/publish-sandbox-bundle.sh --ref <branch-or-sha> --stage <stage> --company <id>
       scripts/publish-sandbox-bundle.sh --stage <stage> --company <id> --clear
EOF
  exit 1
}

TAG=""
REF=""
COMMIT=""
STAGE=""
COMPANY=""
CLEAR=""
VERSION=""

if [[ "${1:-}" == --* ]]; then
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ref) REF="${2:-}"; shift 2 ;;
      --stage) STAGE="${2:-}"; shift 2 ;;
      --company) COMPANY="${2:-}"; shift 2 ;;
      --clear) CLEAR=1; shift ;;
      *) usage ;;
    esac
  done
  [[ -n "$STAGE" && -n "$COMPANY" ]] || usage
  [[ "$COMPANY" =~ ^[0-9]+$ ]] || { echo "company must be a numeric id, got: $COMPANY" >&2; exit 1; }
  if [[ -n "$CLEAR" ]]; then
    [[ -z "$REF" ]] || usage
  else
    [[ -n "$REF" ]] || usage
  fi
else
  TAG="${1:-}"
  STAGE="${2:-}"
  [[ -n "$TAG" && -n "$STAGE" ]] || usage
  VERSION="${3:-${TAG#v}}"
fi

case "$STAGE" in
  dev | prod) ;;
  *)
    echo "stage must be 'dev' or 'prod', got: $STAGE" >&2
    exit 1
    ;;
esac

BUCKET_PREFIX="s3://narrative-agent-skills-bundles-$STAGE/skills"
PIN="$BUCKET_PREFIX/_overrides/company-$COMPANY.json"

if [[ -n "$CLEAR" ]]; then
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "==> DRY_RUN=1, would delete $PIN"
    exit 0
  fi
  echo "==> deleting $PIN"
  aws s3 rm "$PIN"
  echo
  echo "company $COMPANY goes back to the released bundle on $STAGE within a minute."
  exit 0
fi

cd "$(git rev-parse --show-toplevel)"

# A dirty tree would be carried across the checkout (and discarded on restore) -- refuse rather
# than risk the caller's uncommitted work.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "working tree is dirty; commit or stash before running" >&2
  exit 1
fi

# Remember where to return to: the current branch, or the commit if HEAD is already detached.
ORIGINAL_REF="$(git symbolic-ref --quiet --short HEAD || git rev-parse HEAD)"

# Restore on any exit. --force discards the tracked-file changes `gen:all` may produce at the
# checkout; safe because we verified a clean tree above, so anything dirty now is build output.
restore() {
  echo "restoring $ORIGINAL_REF"
  git checkout --quiet --force "$ORIGINAL_REF"
}
trap restore EXIT

git fetch --tags --quiet

if [[ -n "$TAG" ]]; then
  git rev-parse --quiet --verify "refs/tags/$TAG" >/dev/null || {
    echo "no such tag: $TAG" >&2
    exit 1
  }
  CHECKOUT="refs/tags/$TAG"
  LABEL="$TAG"
else
  # Prefer the pushed branch; fall back to a local branch or a sha.
  git fetch --quiet origin
  COMMIT="$(git rev-parse --quiet --verify "origin/$REF^{commit}" || git rev-parse --quiet --verify "$REF^{commit}")" || {
    echo "no such branch or commit: $REF" >&2
    exit 1
  }
  CHECKOUT="$COMMIT"
  LABEL="$REF ($COMMIT)"
  VERSION="snapshot-$(git rev-parse --short=7 "$COMMIT")"
fi

echo "==> checking out $LABEL"
git checkout --quiet --force "$CHECKOUT"

# The bundle pipeline (the build:portable target) landed in v2026.05.1; older commits can't produce a
# bundle. Fail fast with a pointer instead of a cryptic "Script not found" after a pointless install.
if ! grep -q '"build:portable"' package.json; then
  echo "$LABEL predates the sandbox-bundle tooling (no build:portable script); use v2026.05.1 or newer" >&2
  exit 1
fi

echo "==> building portable skills tree"
bun install --frozen-lockfile
bun run build:portable

WORK="$(mktemp -d)"
echo "==> packing bundle.tar.gz (tar root = the skill directories)"
# -C so the archive root is <name>/SKILL.md, which the executor extracts straight into
# /mnt/workspace/skills. skills.json is a sibling object, NOT inside the tarball.
tar -C dist/skills -czf "$WORK/bundle.tar.gz" .
cp dist/skills.json "$WORK/skills.json"

DEST="$BUCKET_PREFIX/$VERSION"

if [[ -n "$COMPANY" ]]; then
  # The worker reads only `version`; the other fields are for people.
  cat >"$WORK/pin.json" <<EOF
{"version": "$VERSION", "ref": "$REF", "commit": "$COMMIT", "published_by": "$(git config user.email || whoami)", "published_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
fi

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "==> DRY_RUN=1, skipping upload"
  echo "    artifacts: $WORK/bundle.tar.gz, $WORK/skills.json"
  echo "    would upload to: $DEST/"
  [[ -z "$COMPANY" ]] || echo "    would pin company $COMPANY: $PIN ($(cat "$WORK/pin.json"))"
  exit 0
fi

echo "==> uploading to $DEST"
aws s3 cp "$WORK/bundle.tar.gz" "$DEST/bundle.tar.gz"
aws s3 cp "$WORK/skills.json" "$DEST/skills.json"

echo
echo "published $LABEL -> $DEST"

if [[ -n "$COMPANY" ]]; then
  echo "==> pinning company $COMPANY: $PIN"
  aws s3 cp "$WORK/pin.json" "$PIN" --content-type application/json
  echo
  echo "company $COMPANY runs $VERSION on $STAGE within a minute. Clear it with:"
  echo "  scripts/publish-sandbox-bundle.sh --stage $STAGE --company $COMPANY --clear"
else
  echo "next: set activityWorker.sandbox.skillsBundleVersion = \"$VERSION\" for stage $STAGE, then deploy the worker."
fi
