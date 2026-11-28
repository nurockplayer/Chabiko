# Node 26 pointer-compression benchmark

**Recommendation: defer adoption.** Keep stock Node 24 for development and CI. The strongest result was typecheck, where caged Node 26 cut median cgroup peak memory by 30.6% versus stock Node 26. The full validation cgroup peak rose 4.5% in the same comparison, both runtimes hit the container's Vitest baseline failures, and the harness failed before browser parity could be checked.

## Results

Three repetitions for each runtime and workload. The table shows medians. Memory is in MiB, times are in seconds, and percentages compare caged 26 with stock 26. Container peak is cgroup `memory.peak`. Tree RSS sums sampled process RSS and can count shared pages more than once.

| Workload | Container peak, 24 / 26 / caged | Tree RSS, 24 / 26 / caged | Elapsed, 24 / 26 / caged | CPU, 24 / 26 / caged | Caged container delta | Status across all runtimes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `pnpm typecheck` | 1,186.1 / 1,165.8 / 808.9 | 1,247.2 / 1,183.0 / 818.3 | 16.04 / 18.57 / 15.61 | 17.28 / 20.38 / 17.12 | −30.6% | 9/9 passed |
| `pnpm test` | 1,707.4 / 1,745.5 / 1,532.6 | 1,346.0 / 1,343.4 / 1,229.7 | 266.45 / 306.79 / 280.23 | 472.52 / 522.81 / 496.54 | −12.2% | 9/9 exited 1 |
| `pnpm build` | 948.4 / 841.3 / 823.0 | 862.6 / 739.9 / 731.3 | 5.33 / 4.88 / 4.32 | 6.71 / 6.13 / 5.56 | −2.2% | 9/9 passed |
| `pnpm validate:full` | 2,129.9 / 1,614.5 / 1,686.6 | 1,882.6 / 1,365.0 / 1,325.7 | 317.59 / 360.33 / 315.31 | 549.52 / 595.40 / 531.92 | +4.5% | 9/9 exited 1 |
| `pnpm audio:generate --dry-run --limit 1` | 61.6 / 64.7 / 57.5 | 113.8 / 113.1 / 107.9 | 0.21 / 0.17 / 0.16 | 0.22 / 0.19 / 0.18 | −11.1% | 9/9 passed |
| `pnpm audio:compare --dry-run` | 48.0 / 55.5 / 45.2 | 95.3 / 109.7 / 91.2 | 0.10 / 0.16 / 0.11 | 0.11 / 0.14 / 0.12 | −18.6% | 9/9 passed |

- **Vitest.** Every runtime reported 9 failed, 2,595 passed, and 71 skipped. The focused stock Node 24 follow-up reproduced all nine failures in the same container setup (eight route tests after a nested Astro build failure, plus one Unicode review CLI assertion). Treat these as the container baseline. Full validation also recorded visual and accessibility launcher failures.
- **Heap, GC and workers.** For typecheck, median max-isolate heapUsed/heapTotal/external went from 883.9/931.2/29.9 MiB on stock 26 to 511.7/555.8/27.5 MiB on caged 26. Test heapUsed went from 228.1 to 186.5 MiB and observed GC count/time from 550/1,314.3 ms to 490/1,111.2 ms. Full validation external memory increased from 99.4 to 125.8 MiB. The checked-in Vitest config uses serial forks with a two-file thread allowlist. All three runtimes sampled a peak of one matching Vitest fork and produced 575 isolate records for `test` and 586 for `validate:full`. The preload produced zero non-main thread records, so thread concurrency cannot be inferred from those counts. No cgroup OOM kills were recorded.
- **Audio and native processes.** Audio dry-run process RSS medians were 85.9/85.0/79.8 MiB for generation and 67.6/80.7/63.1 MiB for comparison. The build's separately classified native RSS medians were 44.3/44.4/43.4 MiB. Dry runs establish launcher behavior only. They provide no measurement for live synthesis or native encoding.
- **Variation.** Stock 26 full-validation cgroup peaks spanned 1,580.2–2,035.8 MiB, versus 1,524.5–1,704.3 MiB on caged 26. The +4.5% median is a regression signal within overlapping ranges. Caged 26's test median was 5.2% slower than the supported stock 24 baseline despite being 8.7% faster than stock 26.

### Playwright follow-up

All 18 `pnpm test:visual` and `pnpm test:a11y` attempts exited 1 with `sleep: invalid option -- 'l'`. The benchmark committed the browser setup container with its `sleep` entrypoint, and the wrapper inherited it when passing `bash -lc`. The job wrapper exited 0 because it completed collection of the failing launcher rows. No browser sibling emitted a row. The zero in the launcher browser field means no browser process was observed. Browser RSS, snapshot parity, and accessibility parity are unavailable.

| Launcher | Container peak, 24 / 26 / caged (MiB) | Tree RSS, 24 / 26 / caged (MiB) | Elapsed, 24 / 26 / caged (s) |
| --- | ---: | ---: | ---: |
| Accessibility | 51.6 / 51.5 / 50.6 | 119.9 / 121.3 / 120.6 | 0.36 / 0.36 / 0.42 |
| Visual | 51.5 / 51.4 / 50.2 | 119.9 / 121.0 / 122.2 | 0.41 / 0.41 / 0.42 |

## Environment and reproduction

- The workload checkout was `db9eea845e6548bd81136df09f61f87a8c4ba034`. The CI pin was Node 24 and the package manager pin was pnpm 12.11.2. Native runs used Linux arm64 with 3 vCPUs and a 4 GiB cgroup limit with no additional swap. The host was arm64 macOS with 16 GiB RAM. OrbStack exposed 6 CPUs and 8,393,318,400 bytes of VM memory. The measurements are inside Linux and exclude macOS and Docker VM overhead. The Playwright image targeted Linux amd64, so a completed browser run on this host would also involve amd64 emulation.
- Actual runtimes from the matching image digests were Node 24.22.3 (V8 13.6.233.17-node.63, ABI 137, Debian 12.15) and Node 26.13.1 (V8 14.6.202.34-node.40, ABI 147, Debian 13.8 stock / 13.7 caged). N-API was 10 on all three. The compression flag was 0/0/1. The in-container default heap limit was 2,240/2,144/2,144 MiB.
- All six installed Linux arm64 native bindings loaded on all three runtimes. The setup probed Astro compiler binding 0.3.1, Satteri 0.9.5, sharp 0.35.3, Rolldown 1.1.5, Rollup 4.62.2, and Lightning CSS 1.33.0. Caged V8 has a 4 GiB address cage per isolate. Additional workers still share the container budget. Raw V8/NAN addons built for stock Node can need a rebuild or block adoption, even when the Node ABI number matches. [Platformatic tradeoffs and addon compatibility](https://github.com/platformatic/node-caged#tradeoffs)
- The runner executes serially via the shared host queue. It installs dependencies with `pnpm install --frozen-lockfile` and `uv sync --locked` during setup. Each top-level command starts a fresh cgroup. Process RSS and per-isolate V8 heapUsed, heapTotal and external are sampled at 50 ms intervals. Role and heap columns are independent peaks. GC aggregates cover isolates that emitted an exit record.

The following commands reproduce the recorded attempts from the repository root with Docker/Buildx and host Python 3. Use harness commit `1dadd1d0` for the main job and `7e97ed6c` for the follow-up in separate worktrees. The browser command reproduces the launcher failure documented above.

```sh
job-run --id chabiko-533-benchmark-r3 -- tachi-run --heavy --host --cpu --est 90m -- bash scripts/node-caged-benchmark/run.sh db9eea845e6548bd81136df09f61f87a8c4ba034
job-run --id chabiko-533-browser -- tachi-run --heavy --host --cpu --est 40m -- bash scripts/node-caged-benchmark/run.sh db9eea845e6548bd81136df09f61f87a8c4ba034 --browser-follow-up
```

Run one job at a time with a fresh job ID if the recorded IDs already exist. The logs contain the `RESULT columns` and `OUTCOME` sections. The runner resolves tags at execution time and records each platform digest. Verify against these digests for a like-for-like run.

| Runtime image | Linux arm64 SHA-256 | Linux amd64 SHA-256 |
| --- | --- | --- |
| `node:24-slim` | `221646a62126710eec41d5acdb3e220ce1f16fa0a5ae223ebe339853a78b4824` | `e0e989b967dacc279681ed81774b2ce9eeebbb0efb8e0c427573235bebf1eda1` |
| `node:26.13.1-trixie-slim` | `519b9d98b6eaca701fd4692e984f96f20e6a441030a2ea612cb329a30c810b5f` | `73c2e404ecdc6a8a8d7febe36ac62fab221fb61627659334a8855a2c198da7a0` |
| `platformatic/node-caged:26-slim` | `4e47c341d53109bcc9dc75ef542b7dbb16e75ad2701ebbbfe90517b99ab505d9` | `984ed6042ffee7f2582bbb1c1e088bb23c77202e23615e4eb22549dcae27f5e7` |

Playwright base was `mcr.microsoft.com/playwright@sha256:cf0daee9b994042e011bc29f20cdff1a9f682a039b43fcd738f7d8a9d3bcd9d6`.

Revisit adoption after a clean stock baseline and a successful Playwright run with the same configs and snapshots. Recheck the per-isolate heap limit and addon load before any rollout. Rollback for this opt-in experiment is to stop invoking the harness and use the existing stock Node 24 validation commands.

## Recorded measurements

The 54 main rows came from the job started at 2026-11-28 04:52 JST. The 18 launcher rows came from the follow-up job started at 2026-11-28 06:38 JST. Labels identify runtime, repetition and command.

```text
label exit elapsed_s CPU_s container_MiB tree_MiB node_MiB browser_MiB audio_MiB native_MiB heapUsed_MiB heapTotal_MiB external_MiB GC_count GC_ms forks worker_isolates isolates oom_kills
caged26-1-audio-compare 0 0.11 0.11 45.2 91.2 0.0 0.0 63.1 28.1 7.2 9.4 8.9 0 0 0 0 1 0
caged26-1-audio-generate 0 0.16 0.15 51.4 115.5 0.0 0.0 87.5 28.0 10.6 14.1 6.1 0 0 0 0 1 0
caged26-1-build 0 5.53 7.03 823.0 731.3 687.1 0.0 0.0 44.2 89.8 166.0 99.6 43 146.1 0 0 1 0
caged26-1-test 1 277.13 484.32 1567.9 1185.8 1082.4 0.0 82.1 210.2 187.1 238.1 100.2 490 1111.2 1 0 575 0
caged26-1-typecheck 0 15.61 16.81 943.3 925.9 897.7 0.0 0.0 28.2 512.4 556.8 27.6 118 413.3 0 0 2 0
caged26-1-validate-full 1 315.31 531.92 1704.3 1325.7 1193.7 0.0 84.5 258.2 511.6 555.9 103.5 717 2068.1 1 0 586 0
caged26-2-audio-compare 0 0.11 0.12 51.6 107.2 0.0 0.0 79.0 28.2 7.8 9.4 8.9 0 0 0 0 1 0
caged26-2-audio-generate 0 0.16 0.18 66.1 107.9 0.0 0.0 79.8 28.1 10.6 14.1 6.1 0 0 0 0 1 0
caged26-2-build 0 3.90 5.09 830.9 771.9 728.8 0.0 0.0 43.1 90.2 169.6 97.5 43 104.8 0 0 1 0
caged26-2-test 1 293.86 505.03 1520.1 1229.7 1109.7 0.0 76.1 235.3 186.5 239.1 150.4 503 1141.8 1 0 575 0
caged26-2-typecheck 0 15.53 17.12 741.3 810.4 782.4 0.0 0.0 28.0 511.7 555.8 27.5 118 446.4 0 0 2 0
caged26-2-validate-full 1 322.28 552.29 1524.5 1408.9 1301.8 0.0 78.1 261.8 511.5 555.8 126.9 698 1796.5 1 0 586 0
caged26-3-audio-compare 0 0.11 0.12 45.1 87.7 0.0 0.0 59.6 28.1 7.9 9.4 8.9 0 0 0 0 1 0
caged26-3-audio-generate 0 0.27 0.26 57.5 102.4 0.0 0.0 74.4 28.0 9.4 14.2 6.1 0 0 0 0 1 0
caged26-3-build 0 4.32 5.56 814.7 707.4 664.1 0.0 0.0 43.4 89.8 172.1 98.1 42 115.4 0 0 1 0
caged26-3-test 1 280.23 496.54 1532.6 1340.3 1258.1 0.0 79.3 240.4 171.5 216.1 89.5 482 1015.4 1 0 575 0
caged26-3-typecheck 0 17.25 19.26 808.9 818.3 789.9 0.0 0.0 28.4 511.6 555.6 27.4 118 553.4 0 0 2 0
caged26-3-validate-full 1 314.13 523.03 1686.6 1297.1 1176.4 0.0 79.6 253.3 511.8 556.3 125.8 698 1871.3 1 0 586 0
node24-1-audio-compare 0 0.10 0.11 48.0 95.8 0.0 0.0 68.0 27.8 10.4 14.2 9.0 0 0 0 0 1 0
node24-1-audio-generate 0 0.21 0.20 61.6 114.3 0.0 0.0 86.4 27.9 8.9 19.2 8.8 0 0 0 0 1 0
node24-1-build 0 5.38 6.71 953.5 867.3 823.0 0.0 0.0 44.3 159.5 243.7 136.1 38 154.1 0 0 1 0
node24-1-test 1 273.45 496.52 2040.4 1732.9 1683.6 0.0 87.4 217.9 295.9 380.9 210.3 488 1193.7 1 0 575 0
node24-1-typecheck 0 17.25 19.52 1388.5 1369.2 1341.3 0.0 0.0 28.9 922.5 1007.8 90.3 120 570.3 0 0 2 0
node24-1-validate-full 1 317.59 549.52 2129.9 1902.4 1812.3 0.0 86.6 261.6 926.3 1010.1 202.2 698 2537.9 1 0 586 0
node24-2-audio-compare 0 0.10 0.12 48.3 87.5 0.0 0.0 59.7 27.8 10.6 14.4 9.0 0 0 0 0 1 0
node24-2-audio-generate 0 0.21 0.24 63.1 109.2 0.0 0.0 81.3 27.9 9.0 19.4 8.8 0 0 0 0 1 0
node24-2-build 0 4.52 5.78 942.6 862.6 820.3 0.0 0.0 42.3 159.6 244.4 143.8 37 116.3 0 0 1 0
node24-2-test 1 259.25 462.56 1678.7 1346.0 1261.5 0.0 87.1 236.9 261.8 350.6 208.0 484 1090.3 1 0 575 0
node24-2-typecheck 0 15.13 16.26 1186.1 1247.2 1219.2 0.0 0.0 28.0 929.3 1009.1 90.1 118 456.5 0 0 2 0
node24-2-validate-full 1 298.68 508.40 1769.1 1432.5 1327.9 0.0 86.9 264.4 915.0 998.6 210.8 714 2407.1 1 0 586 0
node24-3-audio-compare 0 0.11 0.11 47.8 95.3 0.0 0.0 67.6 27.7 10.2 14.2 9.0 0 0 0 0 1 0
node24-3-audio-generate 0 0.21 0.22 55.0 113.8 0.0 0.0 85.9 27.9 8.9 19.7 8.8 0 0 0 0 1 0
node24-3-build 0 5.33 6.72 948.4 824.1 779.7 0.0 0.0 44.5 159.7 245.2 137.7 38 141.0 0 0 1 0
node24-3-test 1 266.45 472.52 1707.4 1340.7 1287.4 0.0 86.6 231.9 308.4 397.8 207.2 477 1303.1 1 0 575 0
node24-3-typecheck 0 16.04 17.28 1163.1 1237.7 1209.7 0.0 0.0 28.0 925.6 1009.1 90.2 118 519.6 0 0 2 0
node24-3-validate-full 1 326.67 563.45 2155.8 1882.6 1810.9 0.0 88.9 259.6 926.2 1009.6 145.4 723 2870.8 1 0 586 0
node26-1-audio-compare 0 0.16 0.19 62.9 109.7 0.0 0.0 80.7 28.9 10.1 12.2 6.2 0 0 0 0 1 0
node26-1-audio-generate 0 0.21 0.21 64.3 123.2 0.0 0.0 94.3 28.9 8.8 19.5 6.1 0 0 0 0 1 0
node26-1-build 0 4.88 5.80 900.1 793.4 749.1 0.0 0.0 44.4 122.6 196.4 89.9 48 110.5 0 0 1 0
node26-1-test 1 306.79 522.81 1745.5 1343.4 1260.6 0.0 76.4 231.0 228.1 285.2 100.0 550 1314.3 1 0 575 0
node26-1-typecheck 0 18.57 20.38 1316.1 1295.1 1278.7 0.0 0.0 28.2 883.9 931.2 29.9 216 527.9 0 0 2 0
node26-1-validate-full 1 360.33 595.40 2035.8 1722.2 1657.5 0.0 85.9 263.9 882.8 930.0 104.3 925 2828.8 1 0 586 0
node26-2-audio-compare 0 0.16 0.14 55.5 112.0 0.0 0.0 83.8 28.3 10.1 12.2 6.2 0 0 0 0 1 0
node26-2-audio-generate 0 0.17 0.19 72.7 101.8 0.0 0.0 73.6 28.2 8.9 19.5 6.1 0 0 0 0 1 0
node26-2-build 0 10.87 12.60 841.3 732.6 688.2 0.0 0.0 44.5 119.6 171.4 88.2 51 178.5 0 0 1 0
node26-2-test 1 349.52 584.32 1532.5 1334.7 1252.3 0.0 93.9 237.7 227.6 295.8 95.4 541 1700.6 1 0 575 0
node26-2-typecheck 0 18.95 20.73 1165.8 1183.0 1154.1 0.0 0.0 28.9 884.8 931.7 29.9 213 644.8 0 0 2 0
node26-2-validate-full 1 386.06 640.88 1614.5 1365.0 1233.6 0.0 93.5 263.1 879.6 927.2 99.4 938 3189.4 1 0 586 0
node26-3-audio-compare 0 0.11 0.09 47.1 103.3 0.0 0.0 75.2 28.1 10.3 12.2 6.2 0 0 0 0 1 0
node26-3-audio-generate 0 0.16 0.17 64.7 113.1 0.0 0.0 85.0 28.1 8.9 19.2 6.1 0 0 0 0 1 0
node26-3-build 0 4.78 6.13 808.7 739.9 696.1 0.0 0.0 43.7 119.1 174.1 98.5 52 128.0 0 0 1 0
node26-3-test 1 271.26 478.03 1933.3 1663.6 1599.6 0.0 87.9 227.8 231.5 273.2 120.4 561 1099.6 1 0 575 0
node26-3-typecheck 0 17.02 18.47 1162.4 1176.4 1148.3 0.0 0.0 28.1 879.6 927.2 29.9 215 545.1 0 0 2 0
node26-3-validate-full 1 301.19 519.09 1580.2 1352.3 1246.4 0.0 91.6 270.2 908.4 943.4 95.0 950 2155.3 1 0 586 0
caged26-1-test-a11y 1 0.47 0.12 50.6 120.6 66.6 0.0 0.0 54.1 6.7 8.1 8.4 0 0 0 0 1 0
caged26-1-test-visual 1 0.52 0.20 75.6 130.8 66.9 0.0 0.0 63.9 6.8 8.1 8.4 0 0 0 0 1 0
caged26-2-test-a11y 1 0.42 0.13 50.6 121.4 66.8 0.0 0.0 54.6 6.7 7.6 8.4 0 0 0 0 1 0
caged26-2-test-visual 1 0.37 0.13 50.2 120.8 66.5 0.0 0.0 54.3 6.8 8.1 8.4 0 0 0 0 1 0
caged26-3-test-a11y 1 0.42 0.12 51.2 120.6 66.5 0.0 0.0 54.2 6.7 7.6 8.4 0 0 0 0 1 0
caged26-3-test-visual 1 0.42 0.14 50.2 122.2 66.8 0.0 0.0 55.4 6.8 8.1 8.4 0 0 0 0 1 0
node24-1-test-a11y 1 0.42 0.13 51.8 119.9 64.2 0.0 0.0 55.8 8.4 10.7 10.9 0 0 0 0 1 0
node24-1-test-visual 1 0.73 0.30 95.1 129.6 64.2 0.0 0.0 65.4 8.4 11.2 10.9 0 0 0 0 1 0
node24-2-test-a11y 1 0.36 0.11 51.2 120.3 64.3 0.0 0.0 56.0 8.4 11.2 10.9 0 0 0 0 1 0
node24-2-test-visual 1 0.41 0.12 51.5 119.7 63.9 0.0 0.0 55.8 8.4 10.7 10.9 0 0 0 0 1 0
node24-3-test-a11y 1 0.31 0.10 51.6 119.8 64.1 0.0 0.0 55.7 8.4 10.7 10.9 0 0 0 0 1 0
node24-3-test-visual 1 0.36 0.10 50.8 119.9 64.2 0.0 0.0 55.7 8.4 10.7 10.9 0 0 0 0 1 0
node26-1-test-a11y 1 0.46 0.16 51.5 124.3 66.5 0.0 0.0 57.8 8.4 10.2 8.4 0 0 0 0 1 0
node26-1-test-visual 1 0.51 0.19 54.1 120.5 66.8 0.0 0.0 53.7 8.4 10.2 8.4 0 0 0 0 1 0
node26-2-test-a11y 1 0.36 0.11 51.1 120.9 66.7 0.0 0.0 54.2 8.4 10.2 8.4 0 0 0 0 1 0
node26-2-test-visual 1 0.41 0.13 50.8 121.3 66.8 0.0 0.0 54.5 8.4 10.2 8.4 0 0 0 0 1 0
node26-3-test-a11y 1 0.32 0.10 51.5 121.3 66.6 0.0 0.0 54.7 8.4 10.7 8.4 0 0 0 0 1 0
node26-3-test-visual 1 0.36 0.11 51.4 121.0 66.8 0.0 0.0 54.3 8.4 10.5 8.4 0 0 0 0 1 0
```
