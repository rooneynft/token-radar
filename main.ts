// Token Radar: an expected-value token-launch radar, round 4 rebuilt as model v7 (Node 22, standard library only).
//
// The run: read the sealed snapshot from /input/snapshot.json (or --input <file|dir>), score
// every pre-token protocol that passes the house launch rule with the model in lib/model.ts
// (launch value off a fitted power law, times token odds off a fitted two-phase no-token
// clock), validate that model on the snapshot's own tokened protocols (held-out + walk-forward
// term tests, odds Brier scores, and a checked P25-P75 range), write the ranked board to
// /output/board.json, copy this repository's dashboard/ and screenshots/ to /output, and
// last write /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program writes
// from the same board — including the validation report, so the page's validation panel
// shows the numbers this run computed, not numbers typed in by hand.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ./snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The run's options: where the snapshot lives and where the output goes. */
interface RunOptions {
  input: string;
  output: string;
}

/** One `--name value` or `--name=value` argument out of argv, or the fallback. */
function argValue(argv: string[], name: string, fallback: string): string {
  const at = argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1]!;
  const withEquals = argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** The run's options out of argv and the environment. */
function parseOptions(argv: string[]): RunOptions {
  const input = argValue(argv, 'input', '/input');
  const output = argValue(argv, 'output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  return { input, output };
}

/** The snapshot file for an input argument: the file itself, or snapshot.json inside a directory. */
function snapshotPath(input: string): string {
  return input.endsWith('.json') ? input : join(input, 'snapshot.json');
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** The screenshots, refused unless there are at least three with legal names. */
function validateShots(shots: string[]): void {
  if (shots.length < 3) {
    process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
    process.exit(1);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
  }
}

/** Write the board, the dashboard data, the dashboard, the screenshots and the dossier. */
function writeOutputs(out: string, board: ReturnType<typeof buildRadar>['board'], radar: ReturnType<typeof buildRadar>['radar']): number {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));
  copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
  validateShots(shots);
  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
  return shots.length;
}

/** The run's one-line summary, printed on success. */
function summarize(snapshot: ReturnType<typeof parseSnapshot>, board: ReturnType<typeof buildRadar>['board'], radar: ReturnType<typeof buildRadar>['radar'], out: string, shots: number): string {
  const v = radar.validation;
  return (
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.off_list_size} off-list, ${radar.live_size} live set aside)\n` +
    `token radar: launch held-out Spearman ${v.held_out_kept.spearman} (flat ${v.held_out_kept.flat_spearman}), walk-forward miss x${v.walk_forward_kept.medfac} (flat x${v.walk_forward_kept.flat_medfac}), odds Brier ${v.odds.walk_forward.brier} vs base ${v.odds.walk_forward.base_brier}, range P25-P75 x${v.range_honesty.p25_factor}-x${v.range_honesty.p75_factor}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots} images) and ${join(out, 'dossier.json')}\n`
  );
}

function main(): void {
  const { input, output } = parseOptions(process.argv);
  const inputFile = snapshotPath(input);
  if (!existsSync(inputFile)) {
    process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
    process.exit(2);
  }
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
    process.exit(1);
  }
  const shots = writeOutputs(output, board, radar);
  process.stdout.write(summarize(snapshot, board, radar, output, shots));
}

main();
