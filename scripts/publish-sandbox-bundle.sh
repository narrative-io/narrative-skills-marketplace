#!/usr/bin/env bash
#
# Build and publish an agent-loop sandbox skills bundle from a tagged marketplace release.
#
# Produces the two objects the control-plane activity worker consumes (SC-60258):
#   s3://narrative-agent-skills-bundles-<stage>/skills/<version>/bundle.tar.gz
#   s3://narrative-agent-skills-bundles-<stage>/skills/<version>/skills.json
# After upload, set helm activityWorker.sandbox.skillsBundleVersion = <version> and deploy.
#
# Checks out <tag>, builds, uploads, then restores the branch you started on (e.g. main) on exit
# even if a step fails. Refuses to run with a dirty working tree.
#
# Usage:
#   scripts/publish-sandbox-bundle.sh <tag> <stage> [version]
#     tag      git tag to build from, e.g. v2026.05.0
#     stage    dev | prod
#     version  S3 path segment + helm skillsBundleVersion (default: <tag> without a leading 'v')
#
#   DRY_RUN=1 scripts/publish-sandbox-bundle.sh <tag> <stage>   # build + pack, skip the S3 upload

set -euo pipefail

usage() {
  echo "usage: scripts/publish-sandbox-bundle.sh <tag> <stage> [version]" >&2
  exit 1
}

TAG="${1:-}"
STAGE="${2:-}"
[[ -n "$TAG" && -n "$STAGE" ]] || usage
VERSION="${3:-${TAG#v}}"

case "$STAGE" in
  dev | prod) ;;
  *)
    echo "stage must be 'dev' or 'prod', got: $STAGE" >&2
    exit 1
    ;;
esac

cd "$(git rev-parse --show-toplevel)"

# A dirty tree would be carried across the tag checkout (and discarded on restore) -- refuse rather
# than risk the caller's uncommitted work.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "working tree is dirty; commit or stash before running" >&2
  exit 1
fi

# Remember where to return to: the current branch, or the commit if HEAD is already detached.
ORIGINAL_REF="$(git symbolic-ref --quiet --short HEAD || git rev-parse HEAD)"

# Restore on any exit. --force discards the tracked-file changes `gen:all` may produce at the tag;
# safe because we verified a clean tree above, so anything dirty now is build output.
restore() {
  echo "restoring $ORIGINAL_REF"
  git checkout --quiet --force "$ORIGINAL_REF"
}
trap restore EXIT

git fetch --tags --quiet
git rev-parse --quiet --verify "refs/tags/$TAG" >/dev/null || {
  echo "no such tag: $TAG" >&2
  exit 1
}

echo "==> checking out $TAG"
git checkout --quiet --force "refs/tags/$TAG"

echo "==> building portable skills tree"
bun install --frozen-lockfile
bun run build:portable

WORK="$(mktemp -d)"
echo "==> packing bundle.tar.gz (tar root = the skill directories)"
# -C so the archive root is <name>/SKILL.md, which the executor extracts straight into
# /mnt/workspace/skills. skills.json is a sibling object, NOT inside the tarball.
tar -C dist/skills -czf "$WORK/bundle.tar.gz" .
cp dist/skills.json "$WORK/skills.json"

DEST="s3://narrative-agent-skills-bundles-$STAGE/skills/$VERSION"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "==> DRY_RUN=1, skipping upload"
  echo "    artifacts: $WORK/bundle.tar.gz, $WORK/skills.json"
  echo "    would upload to: $DEST/"
  exit 0
fi

echo "==> uploading to $DEST"
aws s3 cp "$WORK/bundle.tar.gz" "$DEST/bundle.tar.gz"
aws s3 cp "$WORK/skills.json" "$DEST/skills.json"

echo
echo "published $TAG -> $DEST"
echo "next: set activityWorker.sandbox.skillsBundleVersion = \"$VERSION\" for stage $STAGE, then deploy the worker."
