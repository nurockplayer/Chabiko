#!/usr/bin/env bash
# Run from the repository root under the shared-host heavy queue.
set -euo pipefail
scratch=$(mktemp -d /private/tmp/chabiko-533.XXXXXX)
run_id="chabiko-533-${scratch##*.}"
run_id=$(printf '%s' "$run_id" | tr '[:upper:]' '[:lower:]')
images=()
cleanup() {
  trap - EXIT
  for container in $(docker container ls -q --filter "label=chabiko.bench=$run_id"); do
    docker stop "$container" >&2
  done
  for volume in $(docker volume ls -q --filter "label=chabiko.bench=$run_id"); do
    docker volume rm "$volume" >&2
  done
  for ((i=${#images[@]}-1; i>=0; i--)); do
    if docker image inspect "${images[i]}" >/dev/null 2>&1; then
      docker image rm "${images[i]}" >&2
    fi
  done
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Resolve the platform manifest first so pulling amd64 never replaces an
# existing arm64 tag belonging to another job.
pull() {
  local ref=$1 arch=$2 digest
  digest=$(docker buildx imagetools inspect --raw "$ref" | python3 -c '
import json, sys
manifest = json.load(sys.stdin)
print(next(item["digest"] for item in manifest["manifests"]
           if item.get("platform", {}).get("os") == "linux"
           and item["platform"].get("architecture") == sys.argv[1]))
' "$arch")
  resolved="${ref%@*}"
  resolved="${resolved%%:*}@$digest"
  if ! docker image inspect "$resolved" >/dev/null 2>&1; then
    images+=("$resolved")
    docker pull --platform "linux/$arch" "$resolved" >&2
  fi
}

root=$(pwd)
source_ref=${1:-HEAD}
source_sha=$(git rev-parse "$source_ref^{commit}")
cp scripts/node-caged-benchmark/{profile.py,heap.cjs} "$scratch/"
mkdir "$scratch/bin" "$scratch/results"
ln -s ../profile.py "$scratch/bin/docker"
limits=(--rm --init --cpus 3 --memory 4g --memory-swap 4g --label "chabiko.bench=$run_id")
printf 'started %s\nsource %s\n' "$(TZ=Asia/Tokyo date '+%F %T %Z')" "$source_sha"
docker info --format 'VM={{.OperatingSystem}} arch={{.Architecture}} CPUs={{.NCPU}} RAM_bytes={{.MemTotal}}'
printf 'host arch=%s RAM_bytes=%s\n' "$(uname -m)" "$(sysctl -n hw.memsize)"

pull docker:cli arm64
docker run --rm --platform linux/arm64 --entrypoint cat "$resolved" /usr/local/bin/docker > "$scratch/docker"
chmod +x "$scratch/docker" "$scratch/profile.py"
browser_image=$(sed -n "s/.*'\(mcr.microsoft.com\/playwright@sha256:[0-9a-f]*\)'.*/\1/p" tests/visual/run.ts)
pull "$browser_image" amd64
export BENCH_BROWSER_IMAGE=$resolved
pull "${CAGED_IMAGE:-platformatic/node-caged:26-slim}" arm64
caged=$resolved
patch=$(docker run --rm --platform linux/arm64 --entrypoint node "$caged" -p 'process.versions.node')
stock="node:$patch-trixie-slim"
baseline=${BASELINE_IMAGE:-node:24-slim}
printf 'baseline=%s stock=%s candidate=%s browser=%s\n' "$baseline" "$stock" "${CAGED_IMAGE:-platformatic/node-caged:26-slim}" "$BENCH_BROWSER_IMAGE"

for variant in node24 node26 caged26; do
  case "$variant" in
    node24) ref=$baseline ;;
    node26) ref=$stock ;;
    caged26) ref=${CAGED_IMAGE:-platformatic/node-caged:26-slim} ;;
  esac
  if [[ $variant == caged26 ]]; then
    base=$caged
  else
    pull "$ref" arm64
    base=$resolved
  fi
  pull "$ref" amd64
  mkdir "$scratch/$variant"
  docker run --rm --platform linux/amd64 --entrypoint cat "$resolved" /usr/local/bin/node > "$scratch/$variant/node"
  chmod +x "$scratch/$variant/node"
  echo "images $variant native=$base browser_node=$resolved"

  work="$scratch/work-$variant"
  git clone -q --local --shared "$root" "$work"
  git -C "$work" checkout -q --detach "$source_sha"
  git -C "$work" repack -a -d -q
  rm "$work/.git/objects/info/alternates"
  git -C "$work" update-ref refs/remotes/origin/main "$source_sha"

  # Prepare tools once with a disposable container. Each measured command
  # then starts with a fresh cgroup, so install peaks never appear in its row.
  prepared="$run_id-$variant:bench"
  images+=("$prepared")
  common=("${limits[@]}" --platform linux/arm64 --mount "type=bind,source=$scratch,target=/bench"
    --mount "type=bind,source=$work,target=$work" --workdir "$work" -e CI=1 -e TZ=Asia/Tokyo
    -e BENCH_BROWSER_IMAGE -e "BENCH_ID=$run_id" -e "BENCH_DIR=$scratch" -e "BENCH_VARIANT=$variant")
  setup=$(docker run -d "${common[@]}" --entrypoint sleep "$base" infinity)
  if docker exec "$setup" bash -euo pipefail -c '
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends ca-certificates curl git python3
    mkdir -p /opt/pnpm
    curl -fsSL https://registry.npmjs.org/pnpm/-/pnpm-12.11.2.tgz | tar -xz -C /opt/pnpm --strip-components=1
    ln -sf /opt/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm
    curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
    git config --global --add safe.directory "$PWD"
    pnpm install --frozen-lockfile
    uv sync --locked
    node -p "JSON.stringify({node:process.version,v8:process.versions.v8,arch:process.arch,abi:process.versions.modules,napi:process.versions.napi,compression:process.config.variables.v8_enable_pointer_compression,heapLimit:require(\"node:v8\").getHeapStatistics().heap_size_limit})"
    pnpm --version
    uv --version
    uname -m
    cat /etc/debian_version
    find node_modules/.pnpm -type f -name "*.node" | sort
    node -e "for (const path of process.argv.slice(1)) { try { require(path); console.log(\"ADDON OK\",path); } catch(error) { console.log(\"ADDON FAIL\",path,error.code,error.message); } }" $(find "$PWD/node_modules/.pnpm" -type f -name "*.node" | sort)
  ' > "$scratch/setup-$variant.log" 2>&1; then
    tail -n 12 "$scratch/setup-$variant.log"
    docker commit "$setup" "$prepared" >/dev/null
    docker stop "$setup" >/dev/null
  else
    status=$?
    printf 'SETUP FAIL %s exit=%s\n' "$variant" "$status"
    tail -n 35 "$scratch/setup-$variant.log"
    docker stop "$setup" >/dev/null
    continue
  fi

  for rep in 1 2 3; do
    for task in typecheck test build validate:full audio:generate audio:compare; do
      label="$variant-$rep-${task//:/-}"
      args=("$task")
      case "$task" in
        audio:generate) args+=(--dry-run --limit 1) ;;
        audio:compare) args+=(--dry-run) ;;
      esac
      printf 'run %s\n' "$label"
      status=0
      docker run "${common[@]}" --mount "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock" \
        -e "BENCH_LABEL=$label" --entrypoint /bin/bash "$prepared" -euc '
          export PATH="/bench/bin:$PATH"
          git clean -qfdx -e node_modules -e .venv
          exec python3 /bench/profile.py "$BENCH_LABEL" pnpm "$@"
        ' bash "${args[@]}" > "$scratch/$label.log" 2>&1 || status=$?
      printf 'exit %s %s\n' "$label" "$status"
    done
  done
done

python3 "$scratch/profile.py" summary "$scratch"
printf 'finished %s\n' "$(TZ=Asia/Tokyo date '+%F %T %Z')"
