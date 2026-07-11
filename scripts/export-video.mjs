import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const workspaceDir = path.resolve(projectDir, '..');
const defaultOutDir = path.resolve(projectDir, 'output', 'videos');
const defaultFrameRoot = path.resolve(projectDir, '.export-frames');
const defaultWidth = 1920;
const defaultHeight = 1080;
const defaultFps = 60;
const defaultReserve = 2;
const animationDir = path.join(projectDir, 'public', 'assets', 'animations');

const args = parseArgs(process.argv.slice(2));
const interactive = !args.help
  && !args.list
  && !args.all
  && !args.batch
  && args.scene.length === 0;

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.duration !== undefined) {
  throw new Error('--duration has been replaced by --reserve. Use --reserve <seconds> for pre-roll and post-roll time.');
}

const options = {
  width: readPositiveInteger(args.width, defaultWidth),
  height: readPositiveInteger(args.height, defaultHeight),
  fps: readPositiveInteger(args.fps, defaultFps),
  reserve: readNonNegativeNumber(args.reserve, defaultReserve),
  outDir: path.resolve(projectDir, args.out ?? defaultOutDir),
  keepFrames: Boolean(args.keepFrames),
  frameRoot: path.resolve(projectDir, args.frames ?? defaultFrameRoot),
};

const server = await startViteServer(projectDir);
let browser;

try {
  const browserExecutable = findBrowserExecutable();
  browser = await chromium.launch({
    headless: true,
    executablePath: browserExecutable ?? undefined,
  });

  const sceneList = await readSceneList(browser, server.url, options);
  const sceneCatalog = await classifyScenes(sceneList);

  if (args.list) {
    printSceneCatalog(sceneCatalog);
  } else {
    const selection = interactive
      ? await promptForExport(sceneCatalog, options)
      : { scenes: selectScenes(sceneCatalog, args), options };
    const scenes = selection.scenes;
    if (!selection.cancelled) {
      if (scenes.length === 0) {
        throw new Error('No export scenes selected. Use --list, --all, --batch, or --scene <id> with a scene that has a valid timeline.');
      }

      if (!interactive && isBatchExport(args) && sceneCatalog.skippedScenes.length > 0) {
        printSkippedSummary(sceneCatalog.skippedScenes);
      }

      await mkdir(selection.options.outDir, { recursive: true });

      for (const scene of scenes) {
        await exportScene(browser, server.url, scene, selection.options);
      }
    }
  }
} catch (error) {
  if (isMissingPlaywrightBrowserError(error)) {
    throw new Error(
      'No usable browser was found. Put Chromium under tools/browsers/chromium, install Chrome/Edge, or run npx playwright install chromium.',
      { cause: error },
    );
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}

function printSceneCatalog(sceneCatalog) {
  console.log('Exportable scenes (with timeline):');
  if (sceneCatalog.eligibleScenes.length === 0) {
    console.log('  (none)');
  } else {
    for (const scene of sceneCatalog.eligibleScenes) {
      console.log(`${scene.id}\t${scene.title}\t${formatSeconds(scene.timelineDuration)}`);
    }
  }

  console.log('');
  console.log('Skipped scenes (no valid timeline):');
  if (sceneCatalog.skippedScenes.length === 0) {
    console.log('  (none)');
  } else {
    for (const scene of sceneCatalog.skippedScenes) {
      console.log(`${scene.id}\t${scene.title}\t${scene.skipReason}`);
    }
  }
}

function printSkippedSummary(skippedScenes) {
  console.log('');
  console.log('Skipping scenes without a valid timeline:');
  for (const scene of skippedScenes) {
    console.log(`  ${scene.id} - ${scene.skipReason}`);
  }
  console.log('');
}

async function promptForExport(sceneCatalog, baseOptions) {
  const prompts = await createPromptSession();

  try {
    const sceneList = sceneCatalog.eligibleScenes;
    if (sceneList.length === 0) {
      throw new Error('No scenes with a valid timeline were found.');
    }

    console.log('');
    console.log('FreeWebAnimation Video Export');
    console.log('');
    console.log('Exportable scenes (with timeline):');
    sceneList.forEach((scene, index) => {
      console.log(`  ${index + 1}. ${scene.id} - ${scene.title} (${formatSeconds(scene.timelineDuration)})`);
    });
    console.log('');
    console.log('Skipped scenes (no valid timeline):');
    if (sceneCatalog.skippedScenes.length === 0) {
      console.log('  (none)');
    } else {
      sceneCatalog.skippedScenes.forEach((scene) => {
        console.log(`  - ${scene.id} - ${scene.skipReason}`);
      });
    }
    console.log('');

    const exportMode = await promptForExportMode(prompts);
    const selectedScenes = exportMode === 'batch'
      ? sceneList
      : await promptForScenes(prompts, sceneList);
    const selectedIds = selectedScenes.map((scene) => scene.id);
    const width = await promptForPositiveInteger(prompts, 'Width', baseOptions.width);
    const height = await promptForPositiveInteger(prompts, 'Height', baseOptions.height);
    const fps = await promptForPositiveInteger(prompts, 'FPS', baseOptions.fps);
    const reserve = await promptForNonNegativeNumber(prompts, 'Reserve seconds', baseOptions.reserve);
    const outDirInput = await promptWithDefault(
      prompts,
      'Output folder',
      path.relative(projectDir, baseOptions.outDir) || '.',
    );
    const keepFrames = await promptForYesNo(prompts, 'Keep PNG frames', baseOptions.keepFrames);

    const nextOptions = {
      ...baseOptions,
      width,
      height,
      fps,
      reserve,
      outDir: path.resolve(projectDir, outDirInput),
      keepFrames,
    };

    console.log('');
    console.log('Export summary:');
    console.log(`  Mode: ${exportMode === 'batch' ? 'Batch all candidate scenes' : 'Selected scenes'}`);
    console.log(`  Scenes: ${selectedIds.join(', ')}`);
    console.log(`  Size: ${width}x${height}`);
    console.log(`  FPS: ${fps}`);
    console.log(`  Reserve: ${formatSeconds(reserve)} before + after timeline`);
    console.log('  Video duration:');
    selectedScenes.forEach((scene) => {
      console.log(`    ${scene.id}: ${formatSeconds(getTotalDuration(scene, reserve))}`);
    });
    console.log(`  Output: ${path.relative(projectDir, nextOptions.outDir) || '.'}`);
    console.log('');

    const proceed = await promptForYesNo(prompts, 'Start export', true);
    if (!proceed) {
      console.log('Export cancelled.');
      return { scenes: [], options: nextOptions, cancelled: true };
    }

    return { scenes: selectedScenes, options: nextOptions };
  } finally {
    prompts.close();
  }
}

async function promptForExportMode(rl) {
  while (true) {
    console.log('Export mode:');
    console.log('  1. Select scenes');
    console.log('  2. Batch export all candidate scenes');
    const answer = (await promptWithDefault(rl, 'Choose export mode', '1')).trim().toLowerCase();
    if (answer === '1' || answer === 'select' || answer === 's') {
      return 'select';
    }
    if (answer === '2' || answer === 'batch' || answer === 'b' || answer === 'all' || answer === 'a') {
      return 'batch';
    }
    console.log('Please enter 1 for selected scenes or 2 for batch export.');
  }
}

async function createPromptSession() {
  if (input.isTTY) {
    const rl = createInterface({ input, output });
    return {
      question: (text) => rl.question(text),
      close: () => rl.close(),
    };
  }

  const text = readFileSync(0, 'utf8');
  const lines = text.split(/\r?\n/);
  let index = 0;

  return {
    question: async (text) => {
      const answer = lines[index++] ?? '';
      output.write(text);
      output.write(`${answer}\n`);
      return answer;
    },
    close: () => {},
  };
}

async function promptForScenes(rl, sceneList) {
  while (true) {
    const answer = (await rl.question('Choose scenes (number, 1,3,5, or all): ')).trim().toLowerCase();
    if (answer === 'all' || answer === 'a') {
      return sceneList;
    }

    const parts = answer.split(',').map((part) => part.trim()).filter(Boolean);
    const indexes = parts.map((part) => Number.parseInt(part, 10));
    const valid = indexes.length > 0
      && indexes.every((index) => Number.isInteger(index) && index >= 1 && index <= sceneList.length);

    if (valid) {
      return Array.from(new Set(indexes)).map((index) => sceneList[index - 1]);
    }

    console.log('Please enter a scene number, comma-separated numbers, or all.');
  }
}

async function promptForPositiveInteger(rl, label, fallback) {
  while (true) {
    const answer = await promptWithDefault(rl, label, String(fallback));
    const parsed = Number.parseInt(answer, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    console.log(`${label} must be a positive integer.`);
  }
}

async function promptForNonNegativeNumber(rl, label, fallback) {
  while (true) {
    const answer = await promptWithDefault(rl, label, String(fallback));
    const parsed = Number.parseFloat(answer);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    console.log(`${label} must be zero or a positive number.`);
  }
}

async function promptForYesNo(rl, label, fallback = true) {
  const suffix = fallback ? 'Y/n' : 'y/N';
  while (true) {
    const answer = (await rl.question(`${label} [${suffix}]: `)).trim().toLowerCase();
    if (answer === '') return fallback;
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
    console.log('Please enter y or n.');
  }
}

async function promptWithDefault(rl, label, fallback) {
  const answer = await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `);
  return answer.trim() === '' ? fallback : answer.trim();
}

async function readSceneList(browserInstance, baseUrl, exportOptions) {
  const context = await browserInstance.newContext({
    viewport: {
      width: exportOptions.width,
      height: exportOptions.height,
    },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const url = createManifestUrl(baseUrl);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__freeWebAnimationExport), null, { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => window.__freeWebAnimationExport.ready());
    return await page.evaluate(() => window.__freeWebAnimationExport.listScenes());
  } finally {
    await context.close();
  }
}

async function exportScene(browserInstance, baseUrl, scene, exportOptions) {
  const timelineDuration = scene.timelineDuration;
  const reserve = exportOptions.reserve;
  const totalDuration = getTotalDuration(scene, reserve);
  const frameCount = Math.max(1, Math.ceil(totalDuration * exportOptions.fps));
  const sceneFrameDir = path.join(exportOptions.frameRoot, sanitizeFileName(scene.id));
  const outputPath = path.join(exportOptions.outDir, `${sanitizeFileName(scene.id)}.mp4`);

  console.log(
    `Exporting ${scene.id}: ${exportOptions.width}x${exportOptions.height}, ${exportOptions.fps} fps, `
    + `timeline ${formatSeconds(timelineDuration)}, reserve ${formatSeconds(reserve)} x2, total ${formatSeconds(totalDuration)}`,
  );
  await rm(sceneFrameDir, { recursive: true, force: true });
  await mkdir(sceneFrameDir, { recursive: true });

  const context = await browserInstance.newContext({
    viewport: {
      width: exportOptions.width,
      height: exportOptions.height,
    },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.goto(createExportUrl(baseUrl, {
      scene: scene.id,
      width: exportOptions.width,
      height: exportOptions.height,
    }), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__freeWebAnimationExport), null, { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => window.__freeWebAnimationExport.ready());

    const frame = page.locator('.render-frame');
    await frame.waitFor({ state: 'visible', timeout: 30000 });

    for (let index = 0; index < frameCount; index += 1) {
      const videoTimeSeconds = index / exportOptions.fps;
      const timelineTimeSeconds = index === frameCount - 1
        ? timelineDuration
        : clamp(videoTimeSeconds - reserve, 0, timelineDuration);
      await page.evaluate((time) => window.__freeWebAnimationExport.setTime(time), timelineTimeSeconds);
      const framePath = path.join(sceneFrameDir, `${String(index).padStart(6, '0')}.png`);
      await frame.screenshot({ path: framePath });
      await assertPngSize(framePath, exportOptions.width, exportOptions.height);

      if (index === 0 || index === frameCount - 1 || index % Math.max(1, Math.floor(exportOptions.fps)) === 0) {
        console.log(`  frame ${index + 1}/${frameCount}`);
      }
    }
  } finally {
    await context.close();
  }

  await encodeVideo(sceneFrameDir, outputPath, exportOptions.fps);
  console.log(`  wrote ${path.relative(projectDir, outputPath)}`);

  if (!exportOptions.keepFrames) {
    await rm(sceneFrameDir, { recursive: true, force: true });
  } else {
    console.log(`  kept frames at ${path.relative(projectDir, sceneFrameDir)}`);
  }
}

async function encodeVideo(frameDir, outputPath, fps) {
  const ffmpeg = findFfmpegExecutable();
  if (!ffmpeg) {
    throw new Error(
      'ffmpeg was not found. Put ffmpeg at tools/ffmpeg/bin/ffmpeg.exe, FreeWebAnimation/tools/ffmpeg/bin/ffmpeg.exe, or add ffmpeg to PATH.',
    );
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const inputPattern = path.join(frameDir, '%06d.png');
  const argsList = [
    '-y',
    '-hide_banner',
    '-loglevel', 'warning',
    '-framerate', String(fps),
    '-i', inputPattern,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-preset', 'medium',
    outputPath,
  ];

  await runCommand(ffmpeg, argsList, { cwd: projectDir });
}

async function startViteServer(rootDir) {
  const server = await createViteServer({
    root: rootDir,
    configFile: path.join(rootDir, 'vite.config.mjs'),
    server: {
      host: '127.0.0.1',
      port: 0,
    },
  });
  await server.listen();

  const localUrl = server.resolvedUrls?.local[0];
  if (!localUrl) {
    await server.close();
    throw new Error('Failed to start export Vite server.');
  }

  return {
    url: localUrl,
    close: () => server.close(),
  };
}

async function classifyScenes(sceneList) {
  const results = await Promise.all(sceneList.map(async (scene) => {
    const timelineInfo = await readTimelineInfo(scene.id);
    if (timelineInfo.timelineDuration > 0) {
      return {
        kind: 'eligible',
        scene: {
          ...scene,
          timelineDuration: timelineInfo.timelineDuration,
          timelinePath: timelineInfo.timelinePath,
        },
      };
    }

    return {
      kind: 'skipped',
      scene: {
        ...scene,
        skipReason: timelineInfo.skipReason,
      },
    };
  }));

  return {
    eligibleScenes: results
      .filter((result) => result.kind === 'eligible')
      .map((result) => result.scene),
    skippedScenes: results
      .filter((result) => result.kind === 'skipped')
      .map((result) => result.scene),
  };
}

async function readTimelineInfo(sceneId) {
  const timelinePath = path.join(animationDir, `${sceneId}.timeline.json`);
  if (!existsSync(timelinePath)) {
    return {
      timelineDuration: 0,
      skipReason: 'missing timeline file',
    };
  }

  let timeline;
  try {
    timeline = JSON.parse(await readFile(timelinePath, 'utf8'));
  } catch (error) {
    return {
      timelineDuration: 0,
      skipReason: 'invalid timeline JSON',
    };
  }

  const timelineDuration = getTimelineDurationFromJson(timeline);
  if (timelineDuration <= 0) {
    return {
      timelineDuration: 0,
      skipReason: 'timeline has no positive-duration items',
    };
  }

  return {
    timelineDuration,
    timelinePath,
    skipReason: '',
  };
}

function getTimelineDurationFromJson(timeline) {
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  let maxEnd = 0;

  for (const track of tracks) {
    const items = Array.isArray(track?.items) ? track.items : [];
    for (const item of items) {
      const start = Number(item?.start ?? 0);
      const duration = Number(item?.duration ?? 0);
      if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
        continue;
      }
      maxEnd = Math.max(maxEnd, Math.max(0, start) + duration);
    }
  }

  return maxEnd;
}

function selectScenes(sceneCatalog, parsedArgs) {
  if (isBatchExport(parsedArgs)) {
    return sceneCatalog.eligibleScenes;
  }

  const selectedIds = parsedArgs.scene;
  if (selectedIds.length === 0) {
    return [];
  }

  const sceneById = new Map(sceneCatalog.eligibleScenes.map((scene) => [scene.id, scene]));
  const skippedSceneById = new Map(sceneCatalog.skippedScenes.map((scene) => [scene.id, scene]));
  return selectedIds.map((id) => {
    const scene = sceneById.get(id);
    if (scene) {
      return scene;
    }

    const skippedScene = skippedSceneById.get(id);
    if (skippedScene) {
      throw new Error(`Scene "${id}" cannot be exported: ${skippedScene.skipReason}.`);
    } else {
      throw new Error(`Unknown scene "${id}". Use --list to inspect available scenes.`);
    }
  });
}

function isBatchExport(parsedArgs) {
  return Boolean(parsedArgs.all || parsedArgs.batch);
}

function createExportUrl(baseUrl, { scene, width, height }) {
  const url = new URL('/export.html', baseUrl);
  url.searchParams.set('scene', scene);
  url.searchParams.set('w', String(width));
  url.searchParams.set('h', String(height));
  return url.toString();
}

function createManifestUrl(baseUrl) {
  const url = new URL('/export.html', baseUrl);
  url.searchParams.set('manifest', '1');
  return url.toString();
}

async function assertPngSize(filePath, width, height) {
  const { readPngSize } = await import(pathToFileURL(path.join(scriptDir, 'png-size.mjs')).href);
  const size = await readPngSize(filePath);
  if (size.width !== width || size.height !== height) {
    throw new Error(`Frame size mismatch: expected ${width}x${height}, got ${size.width}x${size.height}`);
  }
}

function findBrowserExecutable() {
  const candidates = [
    path.join(workspaceDir, 'tools', 'browsers', 'chromium', 'chrome-win', 'chrome.exe'),
    path.join(workspaceDir, 'tools', 'browsers', 'chromium', 'chrome.exe'),
    path.join(projectDir, 'tools', 'browsers', 'chromium', 'chrome-win', 'chrome.exe'),
    path.join(projectDir, 'tools', 'browsers', 'chromium', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function isMissingPlaywrightBrowserError(error) {
  return error instanceof Error
    && error.message.includes('Executable doesn\'t exist')
    && error.message.includes('playwright install');
}

function findFfmpegExecutable() {
  const candidates = [
    path.join(workspaceDir, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(projectDir, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe'),
  ];
  const projectFfmpeg = candidates.find((candidate) => existsSync(candidate));
  if (projectFfmpeg) return projectFfmpeg;
  return findOnPath(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

function findOnPath(command) {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(locator, [command], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  return result.stdout.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? null;
}

function runCommand(command, argsList, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argsList, {
      cwd: options.cwd,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function parseArgs(argv) {
  const parsed = {
    scene: [],
    all: false,
    batch: false,
    list: false,
    help: false,
    keepFrames: false,
    width: undefined,
    height: undefined,
    fps: undefined,
    duration: undefined,
    reserve: undefined,
    out: undefined,
    frames: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--list') {
      parsed.list = true;
    } else if (arg === '--all') {
      parsed.all = true;
    } else if (arg === '--batch') {
      parsed.batch = true;
    } else if (arg === '--keep-frames') {
      parsed.keepFrames = true;
    } else if (arg === '--scene') {
      parsed.scene.push(readNextValue(argv, ++index, arg));
    } else if (arg === '--width') {
      parsed.width = readNextValue(argv, ++index, arg);
    } else if (arg === '--height') {
      parsed.height = readNextValue(argv, ++index, arg);
    } else if (arg === '--fps') {
      parsed.fps = readNextValue(argv, ++index, arg);
    } else if (arg === '--duration') {
      parsed.duration = readNextValue(argv, ++index, arg);
    } else if (arg === '--reserve') {
      parsed.reserve = readNextValue(argv, ++index, arg);
    } else if (arg === '--out') {
      parsed.out = readNextValue(argv, ++index, arg);
    } else if (arg === '--frames') {
      parsed.frames = readNextValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function readNextValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readPositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got "${value}"`);
  }
  return parsed;
}

function readNonNegativeNumber(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected zero or a positive number, got "${value}"`);
  }
  return parsed;
}

function getTotalDuration(scene, reserve) {
  return scene.timelineDuration + reserve + reserve;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(value) {
  const rounded = Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${rounded}s`;
}

function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function printHelp() {
  console.log(`
Usage:
  npm run export:video
  npm run export:video -- --list
  npm run export:video -- --scene pbr-showcase --width 1920 --height 1080 --fps 60 --reserve 2 --out output/videos
  npm run export:video -- --batch --width 1920 --height 1080 --fps 60 --out output/videos

Options:
  No options         Open an interactive scene selection menu
  --list             List exportable scenes and skipped scenes
  --all, --batch     Export all candidate scenes as separate videos
  --scene <id>       Export a scene, can be repeated
  --width <px>       Output width, default 1920
  --height <px>      Output height, default 1080
  --fps <number>     Output fps, default 60
  --reserve <sec>    Seconds to hold before and after the timeline, default 2
  --out <dir>        Output directory
  --frames <dir>     Temporary frame root
  --keep-frames      Keep PNG frames after encoding
`);
}
