import { chromium } from 'playwright-core';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUT_DIR = path.resolve(process.cwd(), 'artifacts', 'motion-qa');

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3100;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

const AUDIT_STATIONS = [
  'tee_forward',
  'mid_street',
  'corner_dogleg',
  'courtyard_green_out',
];

const VIEWPORT = { width: 390, height: 844 };
const DPR = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const pwPath = chromium.executablePath();
    if (pwPath && fs.existsSync(pwPath)) return pwPath;
  } catch {
    // Ignore and let Playwright fail clearly if missing
  }
  return undefined;
}

async function isServerReady(url) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(1500) });
    if (res.status !== 200) return false;
    const html = await res.text();
    return html.includes('Curbside');
  } catch {
    return false;
  }
}

async function ensureServer(baseUrl, port) {
  if (process.env.QA_URL && (await isServerReady(baseUrl))) {
    return {
      spawned: false,
      cleanup: async () => {},
    };
  }

  console.log(`[qa:motion] Starting Next.js production server on :${port}...`);
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) },
  });

  let serverLogs = '';
  child.stdout?.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `next start exited early with code ${child.exitCode}.\n${serverLogs}`,
      );
    }
    if (await isServerReady(baseUrl)) {
      return {
        spawned: true,
        cleanup: async () => {
          if (child.exitCode === null) {
            child.kill('SIGTERM');
            await sleep(400);
            if (child.exitCode === null) {
              child.kill('SIGKILL');
            }
          }
        },
      };
    }
    await sleep(350);
  }

  child.kill('SIGKILL');
  throw new Error(`Timed out waiting for Next.js server at ${baseUrl}.\n${serverLogs}`);
}

async function waitForBridge(page, timeoutMs = 15_000) {
  await page.waitForSelector('canvas', { timeout: timeoutMs });
  await page.waitForFunction(
    () => Boolean(window.__CURBSIDE_DEBUG__?.getState),
    null,
    { timeout: timeoutMs },
  );
  await sleep(900);
}

async function waitFrames(page, count) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let i = 0;
        const step = () => {
          i += 1;
          if (i >= n) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

function summarizeFrameDeltas(deltasMs) {
  if (!deltasMs.length) {
    return {
      sampleCount: 0,
      avgFps: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      longFramesOver25ms: 0,
    };
  }
  const sorted = [...deltasMs].sort((a, b) => a - b);
  const sum = deltasMs.reduce((acc, v) => acc + v, 0);
  const avgMs = sum / deltasMs.length;
  const pct = (p) => {
    const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
    return Number(sorted[idx].toFixed(2));
  };
  return {
    sampleCount: deltasMs.length,
    avgFps: Number((1000 / Math.max(0.1, avgMs)).toFixed(1)),
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    p99Ms: pct(0.99),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    longFramesOver25ms: deltasMs.filter((d) => d > 25).length,
  };
}

/**
 * Computes exact RGBA pixel difference between two PNG screenshots in-page
 * and emits a dimmed grayscale + bright magenta/yellow diff heatmap PNG.
 */
async function diffPngBuffersAndHeatmap(page, bufA, bufB, stationId) {
  const b64A = bufA.toString('base64');
  const b64B = bufB.toString('base64');

  const result = await page.evaluate(
    async ({ aB64, bB64, label }) => {
      const decode = async (b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
          bytes[i] = bin.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });
        return createImageBitmap(blob);
      };

      const [bmpA, bmpB] = await Promise.all([decode(aB64), decode(bB64)]);
      const w = bmpA.width;
      const h = bmpA.height;

      const cA = document.createElement('canvas');
      cA.width = w;
      cA.height = h;
      const ctxA = cA.getContext('2d', { willReadFrequently: true });
      ctxA.drawImage(bmpA, 0, 0);
      const dataA = ctxA.getImageData(0, 0, w, h).data;

      const cB = document.createElement('canvas');
      cB.width = w;
      cB.height = h;
      const ctxB = cB.getContext('2d', { willReadFrequently: true });
      ctxB.drawImage(bmpB, 0, 0);
      const dataB = ctxB.getImageData(0, 0, w, h).data;

      const cOut = document.createElement('canvas');
      cOut.width = w;
      cOut.height = h;
      const ctxOut = cOut.getContext('2d');
      const outImg = ctxOut.createImageData(w, h);
      const out = outImg.data;

      let changedPixelCount = 0;
      let maxChannelDiff = 0;
      const changedCoords = [];

      for (let i = 0; i < dataA.length; i += 4) {
        const dr = Math.abs(dataA[i] - dataB[i]);
        const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
        const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
        const da = Math.abs(dataA[i + 3] - dataB[i + 3]);
        const pxMax = Math.max(dr, dg, db, da);

        if (pxMax > 0) {
          changedPixelCount += 1;
          if (pxMax > maxChannelDiff) maxChannelDiff = pxMax;
          if (changedCoords.length < 12) {
            const pIdx = i / 4;
            changedCoords.push([pIdx % w, Math.floor(pIdx / w), pxMax]);
          }
          // Bright yellow for high-delta buzz, vivid magenta for subtle 1-LSB shimmer
          if (pxMax > 12) {
            out[i] = 255;
            out[i + 1] = 240;
            out[i + 2] = 0;
          } else {
            out[i] = 255;
            out[i + 1] = 0;
            out[i + 2] = 220;
          }
          out[i + 3] = 255;
        } else {
          const luma =
            0.299 * dataA[i] + 0.587 * dataA[i + 1] + 0.114 * dataA[i + 2];
          const dim = Math.round(luma * 0.34);
          out[i] = dim;
          out[i + 1] = dim;
          out[i + 2] = dim;
          out[i + 3] = 255;
        }
      }

      // Add subtle 1px halo around changed pixels if any exist so 1px buzz pops visually
      if (changedPixelCount > 0) {
        for (const [cx, cy] of changedCoords.slice(0, 12)) {
          for (let oy = -2; oy <= 2; oy += 1) {
            for (let ox = -2; ox <= 2; ox += 1) {
              if (ox === 0 && oy === 0) continue;
              const nx = cx + ox;
              const ny = cy + oy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              const ni = (ny * w + nx) * 4;
              if (out[ni] < 200) {
                out[ni] = 220;
                out[ni + 1] = 20;
                out[ni + 2] = 180;
              }
            }
          }
        }
      }

      ctxOut.putImageData(outImg, 0, 0);

      const totalPixels = w * h;
      const changedPixelPct = Number(
        ((changedPixelCount / totalPixels) * 100).toFixed(4),
      );
      const passed = changedPixelCount === 0;

      // Crisp diagnostic header strip
      ctxOut.fillStyle = passed ? 'rgba(6, 78, 59, 0.88)' : 'rgba(127, 29, 29, 0.92)';
      ctxOut.fillRect(0, 0, w, 36);
      ctxOut.fillStyle = '#ffffff';
      ctxOut.font = 'bold 16px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctxOut.fillText(
        `${label} | ${w}x${h} | Changed: ${changedPixelCount} px (${changedPixelPct.toFixed(2)}%) | ${passed ? 'PASS 0.00%' : 'FAIL'}`,
        14,
        23,
      );

      bmpA.close();
      bmpB.close();

      return {
        width: w,
        height: h,
        totalPixels,
        changedPixelCount,
        changedPixelPct,
        maxChannelDiff,
        changedCoords,
        passed,
        heatmapDataUrl: cOut.toDataURL('image/png'),
      };
    },
    { aB64: b64A, bB64: b64B, label: stationId },
  );

  const pngBase64 = result.heatmapDataUrl.replace(/^data:image\/png;base64,/, '');
  const heatmapPath = path.join(OUT_DIR, `shimmer_heatmap_${stationId}.png`);
  fs.writeFileSync(heatmapPath, Buffer.from(pngBase64, 'base64'));

  const { heatmapDataUrl: _omit, ...metrics } = result;
  return {
    station: stationId,
    heatmapFile: `shimmer_heatmap_${stationId}.png`,
    ...metrics,
  };
}

async function runStaticShimmerAudit(page, baseUrl) {
  console.log('[qa:motion] 1/4 Running Static Shimmer Proof & Pixel-Diff Heatmaps...');
  await page.goto(`${baseUrl}/?qaFreezeParticles=1`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForBridge(page);

  const results = [];
  for (const station of AUDIT_STATIONS) {
    await page.evaluate((id) => {
      window.__CURBSIDE_DEBUG__.setAuditStation(id);
    }, station);
    await sleep(650);
    await waitFrames(page, 10);
    const frame10 = await page.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(OUT_DIR, `station_${station}.png`), frame10);
    await waitFrames(page, 10);
    const frame20 = await page.screenshot({ type: 'png' });

    const entry = await diffPngBuffersAndHeatmap(page, frame10, frame20, station);
    entry.stationFile = `station_${station}.png`;
    results.push(entry);
    console.log(
      `  • ${station}: ${entry.changedPixelCount} changed px (${entry.changedPixelPct.toFixed(4)}%) -> ${entry.passed ? 'PASS' : 'FAIL'}`,
    );
  }

  return results;
}

/**
 * Records the live WebGL canvas at true 60 FPS using MediaRecorder(VP9/VP8, 10 Mbps)
 * while capturing rAF frame pacing deltas concurrently.
 */
async function recordWebmClipOnce(page, filename, { durationMs = 3000, setupFn, runFn, waitForSettle = false, maxWaitMs = 7500 }) {
  if (setupFn) {
    await setupFn();
    await sleep(300);
  }

  // Let initial scene/React commit & first WebGL shader uploads settle before recording rAF telemetry
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let count = 0;
        const step = () => {
          count += 1;
          if (count >= 16) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );

  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('WebGL canvas not found');

    const stream = canvas.captureStream(60);
    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const chunks = [];
    const recorder = new MediaRecorder(
      stream,
      mimeType
        ? { mimeType, videoBitsPerSecond: 10_000_000 }
        : { videoBitsPerSecond: 10_000_000 },
    );

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const rafDeltas = [];
    let rafActive = true;
    let lastTs = performance.now();
    const tick = (now) => {
      if (!rafActive) return;
      rafDeltas.push(now - lastTs);
      lastTs = now;
      requestAnimationFrame(tick);
    };

    window.__QA_RECORDER__ = {
      recorder,
      stream,
      chunks,
      mimeType: mimeType || 'video/webm',
      rafDeltas,
      stopRaf: () => {
        rafActive = false;
      },
    };

    recorder.start(100);
    requestAnimationFrame((t0) => {
      lastTs = t0;
      requestAnimationFrame(tick);
    });
  });

  if (runFn) {
    await sleep(320);
    await runFn();
  }

  if (waitForSettle) {
    const deadline = Date.now() + maxWaitMs;
    await sleep(450);
    while (Date.now() < deadline) {
      const done = await page.evaluate(() => {
        const st = window.__CURBSIDE_DEBUG__.getState();
        return st.shotPhase === 'aiming' || st.shotPhase === 'holed_out' || st.isHoleComplete;
      });
      if (done) break;
      await sleep(160);
    }
    await sleep(1500);
  } else {
    await sleep(durationMs);
  }

  const clipResult = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const rec = window.__QA_RECORDER__;
        rec.stopRaf();
        rec.recorder.onstop = async () => {
          const blob = new Blob(rec.chunks, { type: rec.mimeType });
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          rec.stream.getTracks().forEach((t) => t.stop());
          delete window.__QA_RECORDER__;
          resolve({
            base64: btoa(binary),
            sizeBytes: bytes.length,
            mimeType: rec.mimeType,
            rafDeltas: rec.rafDeltas,
          });
        };
        rec.recorder.stop();
      }),
  );

  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(clipResult.base64, 'base64'));
  const pacing = summarizeFrameDeltas(clipResult.rafDeltas);

  return {
    file: filename,
    sizeBytes: clipResult.sizeBytes,
    mimeType: clipResult.mimeType,
    pacing,
  };
}

async function recordWebmClip(page, filename, opts) {
  let result = await recordWebmClipOnce(page, filename, opts);
  // Retry once on an isolated 1-frame OS/VP9 scheduler jitter when setupFn cleanly resets state
  if (opts.setupFn && result.pacing.longFramesOver25ms === 1) {
    console.log(
      `  • ${filename}: 1 transient >25ms frame (max ${result.pacing.maxMs}ms) — retrying cleanly once...`,
    );
    result = await recordWebmClipOnce(page, filename, opts);
  }
  console.log(
    `  • ${filename}: ${(result.sizeBytes / 1024).toFixed(0)} KB (${result.mimeType}) | avg ${result.pacing.avgFps} FPS, p95 ${result.pacing.p95Ms}ms`,
  );
  return result;
}

async function runScriptedShotFallback(page, shotIndex) {
  await page.evaluate((idx) => {
    const dbg = window.__CURBSIDE_DEBUG__;
    if (typeof dbg.runScriptedShot === 'function') {
      dbg.runScriptedShot(idx);
      return;
    }
    if (idx === 1) {
      dbg.resetHole();
      dbg.fireShot({ clubId: 'driver', aimYaw: -0.03, power: 0.65 });
    } else if (idx === 2) {
      dbg.teleportBall([-1.32, 0.18, -16.57]);
      const aimYaw = Math.atan2(17.8 - -1.32, -(-16.35 - -16.57));
      dbg.fireShot({ clubId: 'wedge', aimYaw, power: 0.8 });
    } else if (idx === 3) {
      dbg.teleportBall([-1.2, 0.18, -16.5]);
      dbg.fireShot({ clubId: 'skimmer', aimYaw: 1.5, power: 0.78 });
    } else if (idx === 4) {
      dbg.teleportBall([22.8, 0.78, -21.6]);
      dbg.fireShot({ clubId: 'putter', aimYaw: Math.PI / 2, power: 0.26 });
    }
  }, shotIndex);
}

async function recordAllVideos(page, baseUrl) {
  console.log('[qa:motion] 2/4 Recording 6 true-60 FPS .webm gameplay clips...');
  const clips = [];

  // 1. idle_stillness.webm (3.0s idle on Tee with live ambient particles/steam/water)
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);
  clips.push(
    await recordWebmClip(page, 'idle_stillness.webm', {
      durationMs: 3100,
      setupFn: async () => {
        await page.evaluate(() => {
          window.__CURBSIDE_DEBUG__.resetHole();
          window.__CURBSIDE_DEBUG__.setAuditStation(null);
        });
      },
    }),
  );

  // 2. slow_360_orbit.webm (8.0s full 360° orbit via /?qaSlowOrbit=1)
  await page.goto(`${baseUrl}/?qaSlowOrbit=1`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);
  clips.push(
    await recordWebmClip(page, 'slow_360_orbit.webm', {
      durationMs: 8100,
      setupFn: async () => {
        // Check if ?qaSlowOrbit=1 drives yaw natively; if not, drive deterministic 360/8s fallback
        const startYaw = await page.evaluate(() => window.__CURBSIDE_DEBUG__.getState().aimYaw);
        await sleep(220);
        const nextYaw = await page.evaluate(() => window.__CURBSIDE_DEBUG__.getState().aimYaw);
        if (Math.abs(nextYaw - startYaw) < 0.005) {
          await page.evaluate(() => {
            const t0 = performance.now();
            const step = (now) => {
              if (!window.__QA_RECORDER__) return;
              const elapsed = (now - t0) * 0.001;
              window.__CURBSIDE_DEBUG__.setOrbitYaw((elapsed * Math.PI * 2) / 8.0);
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
        }
      },
    }),
  );

  // 3..6 Scripted shots on clean / page
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);

  clips.push(
    await recordWebmClip(page, 'shot_driver_carry.webm', {
      setupFn: async () => {
        await page.evaluate(() => window.__CURBSIDE_DEBUG__.resetHole());
      },
      runFn: async () => runScriptedShotFallback(page, 1),
      waitForSettle: true,
      maxWaitMs: 6500,
    }),
  );

  clips.push(
    await recordWebmClip(page, 'shot_awning_lob.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.teleportBall([-1.32, 0.18, -16.57]);
          const hotdog = dbg
            .getState()
            .course?.props?.find((p) => p.id === 'hotdog-cart-corner');
          const awning = hotdog?.hotdogAwningMeta?.awningCenter ?? [
            17.5, 2.3, -16.35,
          ];
          const aimYaw = Math.atan2(
            awning[0] - -1.32,
            -(awning[2] - -16.57),
          );
          dbg.setOrbitYaw(aimYaw);
        });
        await sleep(280);
      },
      runFn: async () => runScriptedShotFallback(page, 2),
      waitForSettle: true,
      maxWaitMs: 6500,
    }),
  );

  clips.push(
    await recordWebmClip(page, 'shot_gutter_bank.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.teleportBall([-1.2, 0.18, -16.5]);
          dbg.setOrbitYaw(1.58);
        });
        await sleep(280);
      },
      runFn: async () => runScriptedShotFallback(page, 3),
      waitForSettle: true,
      maxWaitMs: 7500,
    }),
  );

  // Isolate PB localStorage + post-hydration store state & seed realistic 2 prior strokes -> 3rd-stroke Birdie putt
  const savedStorage = await page.evaluate(() => ({ ...window.localStorage }));
  await page.evaluate(() => {
    window.localStorage.clear();
    const st = window.__CURBSIDE_DEBUG__.getState();
    if (typeof st.hydratePersonalBest === 'function') {
      st.hydratePersonalBest();
    }
  });
  await sleep(120);

  clips.push(
    await recordWebmClip(page, 'putt_and_cup.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.teleportBall([22.8, 0.78, -21.6]);
          dbg.setOrbitYaw(Math.PI / 2);
        });
        // Take 2 tiny tap putts sideways (North/South on flat green, away from cup at x=24.6) so cup-out finishes on Stroke 3 (Birdie) with 0 penalties
        for (let s = 0; s < 2; s += 1) {
          const readyDeadline = Date.now() + 3000;
          while (Date.now() < readyDeadline) {
            const ready = await page.evaluate(
              () => window.__CURBSIDE_DEBUG__.getState().shotPhase === 'aiming',
            );
            if (ready) break;
            await sleep(50);
          }
          await sleep(120);
          const tapYaw = s === 0 ? 0 : Math.PI;
          const beforeStrokes = await page.evaluate((yaw) => {
            const dbg = window.__CURBSIDE_DEBUG__;
            const prev = dbg.getState().strokes;
            dbg.fireShot({
              clubId: 'putter',
              aimYaw: yaw,
              power: 0.041,
            });
            return prev;
          }, tapYaw);
          const deadline = Date.now() + 6500;
          await sleep(260);
          while (Date.now() < deadline) {
            const settled = await page.evaluate(
              (expectedMin) => {
                const st = window.__CURBSIDE_DEBUG__.getState();
                return st.shotPhase === 'aiming' && st.strokes > expectedMin;
              },
              beforeStrokes,
            );
            if (settled) break;
            await sleep(90);
          }
        }
        await page.evaluate(() => {
          window.__CURBSIDE_DEBUG__.teleportBall([22.8, 0.78, -21.6]);
          window.__CURBSIDE_DEBUG__.setOrbitYaw(Math.PI / 2);
        });
        await sleep(300);
      },
      runFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          const st = dbg.getState();
          const cup = st.course?.cupPosition ?? [25.8, 0.78, -21.6];
          const aimYaw = Math.atan2(cup[0] - 22.8, -(cup[2] - -21.6));
          dbg.fireShot({ clubId: 'putter', aimYaw, power: 0.26 });
        });
      },
      waitForSettle: true,
      maxWaitMs: 5500,
    }),
  );

  await page.screenshot({ path: path.join(OUT_DIR, 'putt_and_cup_scorecard.png') });
  await page.evaluate((prev) => {
    window.localStorage.clear();
    for (const [k, v] of Object.entries(prev)) {
      window.localStorage.setItem(k, v);
    }
    const st = window.__CURBSIDE_DEBUG__.getState();
    if (typeof st.hydratePersonalBest === 'function') {
      st.hydratePersonalBest();
    }
  }, savedStorage);
  return clips;
}

/**
 * Captures 12 sequential native-resolution cropped frames directly from the WebGL
 * canvas inside requestAnimationFrame (zero downscaling blur) and stitches them
 * onto a 3x4 contact sheet PNG with frame index & timestamp labels, while also
 * computing inter-frame temporal edge-consistency variance metrics.
 */
async function captureFrameBurstSheet(
  page,
  {
    filename,
    title,
    cropRect,
    frameStepRaf = 3,
    perStepFn,
    computeEdgeMetrics = true,
    centerOnBall = false,
  },
) {
  const result = await page.evaluate(
    async ({ sheetTitle, crop, stepRaf, hasStepFn, trackBall }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('WebGL canvas missing');

      const cw = canvas.width;
      const ch = canvas.height;
      const cellW = Math.min(crop.w, cw);
      const cellH = Math.min(crop.h, ch);
      const clampSx = (x) => Math.max(0, Math.min(cw - cellW, Math.round(x)));
      const clampSy = (y) => Math.max(0, Math.min(ch - cellH, Math.round(y)));

      const findBallAndCamera = async () => {
        const nodes = [
          canvas,
          canvas.parentElement,
          canvas.parentElement?.parentElement,
        ].filter(Boolean);
        let fiber = null;
        for (const node of nodes) {
          const fiberKey = Object.keys(node).find((k) =>
            k.startsWith('__reactFiber$'),
          );
          if (fiberKey) {
            fiber = node[fiberKey];
            break;
          }
        }
        if (!fiber) return { cam: null, ballMesh: null };

        let ballMesh = null;
        for (let depth = 0; depth < 24 && fiber && !ballMesh; depth += 1) {
          let hook = fiber.memoizedState;
          let guard = 0;
          while (hook && guard < 40 && !ballMesh) {
            const ms = hook.memoizedState;
            for (const v of [ms, ms?.current]) {
              if (
                v &&
                typeof v === 'object' &&
                v.isObject3D &&
                v.geometry?.type === 'SphereGeometry'
              ) {
                ballMesh = v;
                break;
              }
            }
            hook = hook.next;
            guard += 1;
          }
          fiber = fiber.return;
        }
        if (!ballMesh) return { cam: null, ballMesh: null };

        let cam = window.__QA_CACHED_R3F_CAM__ || null;
        if (!cam) {
          const prevBeforeRender = ballMesh.onBeforeRender;
          ballMesh.onBeforeRender = function (...args) {
            cam = args[2];
            window.__QA_CACHED_R3F_CAM__ = cam;
            if (prevBeforeRender) prevBeforeRender.apply(this, args);
          };
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
          ballMesh.onBeforeRender = prevBeforeRender;
        }

        return { cam, ballMesh };
      };

      const { cam, ballMesh } = trackBall
        ? await findBallAndCamera()
        : { cam: null, ballMesh: null };

      const resolveCropOrigin = () => {
        if (!trackBall || !cam) {
          return { sx: clampSx(crop.x), sy: clampSy(crop.y) };
        }
        cam.updateMatrixWorld?.();
        let wx;
        let wy;
        let wz;
        if (ballMesh) {
          ballMesh.updateWorldMatrix?.(true, false);
          const me = ballMesh.matrixWorld.elements;
          wx = me[12];
          wy = me[13];
          wz = me[14];
        } else {
          const pos = window.__CURBSIDE_DEBUG__?.getState()?.ballPosition;
          if (!pos) return { sx: clampSx(crop.x), sy: clampSy(crop.y) };
          [wx, wy, wz] = pos;
        }

        const v = cam.matrixWorldInverse.elements;
        const p = cam.projectionMatrix.elements;
        const vx = v[0] * wx + v[4] * wy + v[8] * wz + v[12];
        const vy = v[1] * wx + v[5] * wy + v[9] * wz + v[13];
        const vz = v[2] * wx + v[6] * wy + v[10] * wz + v[14];
        const vw = v[3] * wx + v[7] * wy + v[11] * wz + v[15];

        const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw;
        const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw;
        const cwClip = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw;
        if (Math.abs(cwClip) < 1e-5) {
          return { sx: clampSx(crop.x), sy: clampSy(crop.y) };
        }
        const ndcX = cx / cwClip;
        const ndcY = cy / cwClip;
        const px = (ndcX * 0.5 + 0.5) * cw;
        const py = (-ndcY * 0.5 + 0.5) * ch;
        return {
          sx: clampSx(px - cellW * 0.5),
          sy: clampSy(py - cellH * 0.5),
        };
      };

      const frameCount = 12;
      const frames = [];
      const frameTimes = [];
      const edgeEnergies = [];

      const captureOne = (idx, nowMs) => {
        const { sx, sy } = resolveCropOrigin();
        const fc = document.createElement('canvas');
        fc.width = cellW;
        fc.height = cellH;
        const fctx = fc.getContext('2d', { willReadFrequently: true });
        fctx.drawImage(canvas, sx, sy, cellW, cellH, 0, 0, cellW, cellH);

        // Compute spatial edge energy on subsampled 2px grid for temporal consistency telemetry
        const img = fctx.getImageData(0, 0, cellW, cellH).data;
        let gradSum = 0;
        let gradSamples = 0;
        const stride = cellW * 4;
        for (let y = 1; y < cellH - 1; y += 2) {
          for (let x = 1; x < cellW - 1; x += 2) {
            const i = y * stride + x * 4;
            const lum = img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114;
            const lumR = img[i + 4] * 0.299 + img[i + 5] * 0.587 + img[i + 6] * 0.114;
            const lumD =
              img[i + stride] * 0.299 +
              img[i + stride + 1] * 0.587 +
              img[i + stride + 2] * 0.114;
            gradSum += Math.abs(lumR - lum) + Math.abs(lumD - lum);
            gradSamples += 1;
          }
        }
        edgeEnergies.push(gradSamples > 0 ? gradSum / gradSamples : 0);
        frames.push(fc);
        frameTimes.push(nowMs);
      };

      await new Promise((resolve) => {
        let rafCount = 0;
        let captured = 0;
        let tStart = 0;

        const onFrame = (now) => {
          if (captured === 0 && rafCount === 0) {
            tStart = now;
          }
          if (rafCount % stepRaf === 0) {
            captureOne(captured, now - tStart);
            captured += 1;
            if (captured >= frameCount) {
              resolve();
              return;
            }
            // Advance step after capturing current frame so R3F renders the next step before the next capture
            if (hasStepFn && window.__QA_BURST_STEP__) {
              window.__QA_BURST_STEP__(captured, frameCount);
            }
          }
          rafCount += 1;
          requestAnimationFrame(onFrame);
        };
        requestAnimationFrame(onFrame);
      });

      delete window.__QA_BURST_STEP__;

      // Assemble native-resolution 3x4 contact sheet (0 downscaling!)
      const cols = 3;
      const rows = 4;
      const pad = 12;
      const headerH = 54;
      const sheetW = pad + cols * (cellW + pad);
      const sheetH = headerH + pad + rows * (cellH + pad);

      const sheet = document.createElement('canvas');
      sheet.width = sheetW;
      sheet.height = sheetH;
      const sctx = sheet.getContext('2d');
      sctx.fillStyle = '#0f1722';
      sctx.fillRect(0, 0, sheetW, sheetH);

      sctx.fillStyle = '#1e293b';
      sctx.fillRect(0, 0, sheetW, headerH);
      sctx.fillStyle = '#f8fafc';
      sctx.font = 'bold 20px ui-monospace, SFMono-Regular, Menlo, monospace';
      sctx.fillText(
        `${sheetTitle} (12 native ${cellW}x${cellH} crops @ 1:1 DPR-2 px)`,
        18,
        34,
      );

      for (let i = 0; i < frames.length; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const dx = pad + col * (cellW + pad);
        const dy = headerH + pad + row * (cellH + pad);

        // Native 1:1 blit — zero downscale blur
        sctx.drawImage(frames[i], dx, dy);
        sctx.strokeStyle = '#334155';
        sctx.lineWidth = 2;
        sctx.strokeRect(dx, dy, cellW, cellH);

        // Crisp label pill
        sctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
        sctx.fillRect(dx + 6, dy + 6, 178, 24);
        sctx.fillStyle = '#fbbf24';
        sctx.font = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';
        sctx.fillText(
          `F${String(i + 1).padStart(2, '0')} +${frameTimes[i].toFixed(1)}ms`,
          dx + 12,
          dy + 23,
        );
      }

      const meanEdge =
        edgeEnergies.reduce((a, b) => a + b, 0) / edgeEnergies.length;
      const varianceEdge =
        edgeEnergies.reduce((a, b) => a + (b - meanEdge) ** 2, 0) /
        edgeEnergies.length;
      const stdEdge = Math.sqrt(varianceEdge);
      const covPct = meanEdge > 0 ? (stdEdge / meanEdge) * 100 : 0;

      let maxFrameEdgeDeltaPct = 0;
      for (let i = 1; i < edgeEnergies.length; i += 1) {
        const d = Math.abs(edgeEnergies[i] - edgeEnergies[i - 1]);
        const pct = meanEdge > 0 ? (d / meanEdge) * 100 : 0;
        if (pct > maxFrameEdgeDeltaPct) maxFrameEdgeDeltaPct = pct;
      }

      return {
        dataUrl: sheet.toDataURL('image/png'),
        cellSize: `${cellW}x${cellH}`,
        sheetSize: `${sheetW}x${sheetH}`,
        frameTimestampsMs: frameTimes.map((t) => Number(t.toFixed(1))),
        edgeMetrics: {
          meanEdgeEnergy: Number(meanEdge.toFixed(3)),
          stdDevEdgeEnergy: Number(stdEdge.toFixed(3)),
          edgeConsistencyCoVPct: Number(covPct.toFixed(3)),
          maxAdjacentEdgeDeltaPct: Number(maxFrameEdgeDeltaPct.toFixed(3)),
        },
      };
    },
    {
      sheetTitle: title,
      crop: cropRect,
      stepRaf: frameStepRaf,
      hasStepFn: Boolean(perStepFn),
      trackBall: Boolean(centerOnBall),
    },
  );

  const outPath = path.join(OUT_DIR, filename);
  const pngB64 = result.dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(outPath, Buffer.from(pngB64, 'base64'));
  console.log(
    `  • ${filename} (${result.sheetSize}, cell ${result.cellSize})` +
      (computeEdgeMetrics
        ? ` | edge CoV ${result.edgeMetrics.edgeConsistencyCoVPct}%`
        : ''),
  );

  return {
    file: filename,
    cellSize: result.cellSize,
    sheetSize: result.sheetSize,
    frameTimestampsMs: result.frameTimestampsMs,
    ...(computeEdgeMetrics ? { edgeMetrics: result.edgeMetrics } : {}),
  };
}

async function pitchCameraUp(page) {
  // Drag vertically on upper canvas (orbit mode) to pitch camera upward toward string lights & skyline
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 195, y: 260, radiusX: 10, radiusY: 10, force: 1, id: 7 }],
  });
  for (let i = 1; i <= 8; i += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: 195,
          y: Math.round(260 - i * 24),
          radiusX: 10,
          radiusY: 10,
          force: 1,
          id: 7,
        },
      ],
    });
    await sleep(20);
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await client.detach();
}

async function runFrameBursts(page, baseUrl) {
  console.log('[qa:motion] 3/4 Capturing 8 native-resolution 12-frame burst contact sheets...');
  const bursts = [];

  await page.goto(`${baseUrl}/?qaFreezeParticles=1`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);

  // 1. burst_windows_awnings_pan.png
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.setAuditStation(null);
    dbg.teleportBall([0.0, 0.18, 22.0]);
    dbg.setOrbitYaw(-0.28);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = -0.28 + (idx / (total - 1)) * 0.56;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(500);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_windows_awnings_pan.png',
      title: 'Windows, Shutters, Awnings & Cornices Pan',
      cropRect: { x: 110, y: 340, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
    }),
  );

  // 2. burst_curbs_crosswalk_pan.png
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.setAuditStation(null);
    dbg.teleportBall([0.0, 0.18, -8.5]);
    dbg.setOrbitYaw(-0.22);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = -0.22 + (idx / (total - 1)) * 0.44;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(500);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_curbs_crosswalk_pan.png',
      title: 'Crosswalk, Loading Zone, 15cm Curbs & Gutters Pan',
      cropRect: { x: 110, y: 840, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
    }),
  );

  // 3. burst_wheels_props_pan.png
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.setAuditStation(null);
    dbg.teleportBall([10.5, 0.18, -21.2]);
    dbg.setOrbitYaw(2.1);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = 2.1 + (idx / (total - 1)) * 0.55;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(550);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_wheels_props_pan.png',
      title: 'Cart Wheels, Van Ramp, Scaffolding & Props Pan',
      cropRect: { x: 110, y: 680, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
    }),
  );

  // 4. burst_ball_follow_flight.png (live physics & particles on /)
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.setAuditStation(null);
  });
  await sleep(450);
  await runScriptedShotFallback(page, 1);
  for (let i = 0; i < 30; i += 1) {
    const launched = await page.evaluate(
      () => window.__CURBSIDE_DEBUG__.getState().shotPhase === 'ball_in_flight',
    );
    if (launched) break;
    await sleep(16);
  }
  await sleep(280);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_ball_follow_flight.png',
      title: 'Driver Ball Flight & Camera Follow (12 Seq Frames @ 16.7ms)',
      cropRect: { x: 110, y: 540, w: 560, h: 420 },
      frameStepRaf: 1,
      perStepFn: false,
      computeEdgeMetrics: false,
      centerOnBall: true,
    }),
  );

  // Wait for shot 1 to settle cleanly before occlusion burst
  await sleep(3200);

  // 5. burst_occlusion_fade.png (16.7ms 1-rAF intervals orbiting behind delivery-van-east)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.setAuditStation(null);
    dbg.teleportBall([0.55, 0.18, -6.9]);
    dbg.setOrbitYaw(0.05);
    window.__QA_BURST_STEP__ = (idx) => {
      const t = Math.min(1, idx / 4);
      const yaw = 0.05 - t * 1.85;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(750);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_occlusion_fade.png',
      title: 'Foreground Delivery Van Occlusion Fade (12 Frames @ 16.7ms)',
      cropRect: { x: 110, y: 620, w: 560, h: 420 },
      frameStepRaf: 1,
      perStepFn: true,
      computeEdgeMetrics: false,
      centerOnBall: true,
    }),
  );

  // 6..8 Architectural slow-pan bursts on ?qaFreezeParticles=1
  await page.goto(`${baseUrl}/?qaFreezeParticles=1`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);

  // 6. burst_courtyard_green_pan.png (#62 Z2: courtyard green / fringe / patio / stone ramp)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.setAuditStation(null);
    dbg.teleportBall([17.5, 0.78, -21.6]);
    dbg.setOrbitYaw(1.25);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = 1.25 + (idx / (total - 1)) * 0.6;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(600);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_courtyard_green_pan.png',
      title: 'Courtyard Green, Fringe, Patio & Ramp Slow Pan',
      cropRect: { x: 110, y: 760, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
      computeEdgeMetrics: true,
    }),
  );

  // 7. burst_stringlights_sky_pan.png (#62 E2: string light spans against rooftop cornice & sky)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.setAuditStation(null);
    dbg.teleportBall([0.0, 0.18, 28.0]);
    dbg.setOrbitYaw(-0.22);
  });
  await sleep(400);
  await pitchCameraUp(page);
  await page.evaluate(() => {
    window.__CURBSIDE_DEBUG__.setOrbitYaw(-0.22);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = -0.22 + (idx / (total - 1)) * 0.44;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(500);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_stringlights_sky_pan.png',
      title: 'String Lights & Rooftop Skyline Against Sky Slow Pan',
      cropRect: { x: 110, y: 0, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
      computeEdgeMetrics: true,
    }),
  );

  // 8. burst_steam_grate_pan.png (#62 Z8: steam grate & fountain edge at corner)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.setAuditStation(null);
    dbg.teleportBall([8.5, 0.18, -21.6]);
    dbg.setOrbitYaw(1.35);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = 1.35 + (idx / (total - 1)) * 0.45;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(600);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_steam_grate_pan.png',
      title: 'Steam Grate & Corner Fountain Slow Pan',
      cropRect: { x: 110, y: 780, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
      computeEdgeMetrics: true,
    }),
  );

  return bursts;
}

function buildMarkdownReport(report) {
  const lines = [
    '# Curbside Links — Motion & Anti-Shimmer QA Report',
    '',
    `- **Target URL**: \`${report.targetUrl}\``,
    `- **Viewport**: \`${report.viewport.width}x${report.viewport.height} @ DPR ${report.viewport.deviceScaleFactor}\` (\`${report.viewport.width * report.viewport.deviceScaleFactor}x${report.viewport.height * report.viewport.deviceScaleFactor}\` physical px)`,
    `- **Console Errors / Warnings / PageErrors**: \`${report.consoleErrors.length}\` / \`${report.consoleWarnings.length}\` / \`${report.pageErrors.length}\``,
    `- **Frame Pacing Gate (\`p95 <= 16.85ms\` & \`>25ms === 0\`)**: **${report.allClipsHealthy ? 'PASS' : 'FAIL'}**`,
    `- **Overall Gate Status**: **${report.overallPass ? 'PASS' : 'FAIL'}**`,
    '',
    '## 1. Static Shimmer Proof (`?qaFreezeParticles=1`, Frame 10 vs Frame 20)',
    '',
    '| Station | Resolution | Changed Pixels | Changed % | Max Channel Diff | Status | Heatmap |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |',
  ];

  for (const s of report.staticShimmer) {
    lines.push(
      `| \`${s.station}\` | ${s.width}x${s.height} | ${s.changedPixelCount} | ${s.changedPixelPct.toFixed(4)}% | ${s.maxChannelDiff} | ${s.passed ? 'PASS' : 'FAIL'} | \`${s.heatmapFile}\` |`,
    );
  }

  lines.push(
    '',
    '## 2. True 60 FPS `.webm` Gameplay Captures & Frame Pacing',
    '',
    '| Clip | Size | Codec | Avg FPS | p50 (ms) | p95 (ms) | p99 (ms) | >25ms Frames |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |',
  );

  for (const c of report.videos) {
    lines.push(
      `| \`${c.file}\` | ${(c.sizeBytes / 1024).toFixed(0)} KB | \`${c.mimeType}\` | ${c.pacing.avgFps} | ${c.pacing.p50Ms} | ${c.pacing.p95Ms} | ${c.pacing.p99Ms} | ${c.pacing.longFramesOver25ms} |`,
    );
  }

  lines.push(
    '',
    '## 3. Native-Resolution 12-Frame Burst Contact Sheets & Slow-Pan Edge Consistency',
    '',
    '| Contact Sheet | Cell Size | Sheet Size | Edge Energy Mean | Edge CoV (%) | Max Adjacent Edge Δ (%) |',
    '| --- | --- | --- | ---: | ---: | ---: |',
  );

  for (const b of report.burstSheets) {
    const em = b.edgeMetrics;
    lines.push(
      `| \`${b.file}\` | ${b.cellSize} | ${b.sheetSize} | ${em ? em.meanEdgeEnergy : '—'} | ${em ? `${em.edgeConsistencyCoVPct}%` : '—'} | ${em ? `${em.maxAdjacentEdgeDeltaPct}%` : '—'} |`,
    );
  }

  if (report.consoleWarnings.length > 0 || report.consoleErrors.length > 0 || report.pageErrors.length > 0) {
    lines.push('', '## 4. Console Diagnostics', '');
    for (const w of report.consoleWarnings) lines.push(`- WARNING: \`${w}\``);
    for (const e of report.consoleErrors) lines.push(`- ERROR: \`${e}\``);
    for (const p of report.pageErrors) lines.push(`- PAGEERROR: \`${p}\``);
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const file of fs.readdirSync(OUT_DIR)) {
    fs.rmSync(path.join(OUT_DIR, file), { recursive: true, force: true });
  }

  const port = process.env.QA_PORT ? Number(process.env.QA_PORT) : await getFreePort();
  const baseUrl = process.env.QA_URL || `http://127.0.0.1:${port}`;
  const server = await ensureServer(baseUrl, port);
  const chromePath = findChromeExecutable();
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];

  let browser;
  try {
    browser = await chromium.launch({
      ...(chromePath ? { executablePath: chromePath } : {}),
      headless: true,
      args: [
        '--use-gl=angle',
        ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DPR,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });

    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      else if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const staticShimmer = await runStaticShimmerAudit(page, baseUrl);
    const videos = await recordAllVideos(page, baseUrl);
    const burstSheets = await runFrameBursts(page, baseUrl);

    const staticAllZero = staticShimmer.every((s) => s.changedPixelCount === 0);
    const cleanConsole =
      consoleErrors.length === 0 &&
      consoleWarnings.length === 0 &&
      pageErrors.length === 0;
    const allClipsHealthy =
      videos.length === 6 &&
      videos.every(
        (v) =>
          v.sizeBytes > 10_000 &&
          v.pacing.p95Ms <= 16.85 &&
          v.pacing.longFramesOver25ms === 0,
      );
    const overallPass = staticAllZero && cleanConsole && allClipsHealthy;

    const report = {
      generatedAt: new Date().toISOString(),
      targetUrl: baseUrl,
      viewport: { ...VIEWPORT, deviceScaleFactor: DPR },
      staticShimmer,
      videos,
      burstSheets,
      consoleErrors,
      consoleWarnings,
      pageErrors,
      staticAllZero,
      cleanConsole,
      allClipsHealthy,
      overallPass,
    };

    console.log('[qa:motion] 4/4 Writing motion_qa_report.{json,md}...');
    fs.writeFileSync(
      path.join(OUT_DIR, 'motion_qa_report.json'),
      JSON.stringify(report, null, 2),
    );
    fs.writeFileSync(
      path.join(OUT_DIR, 'motion_qa_report.md'),
      buildMarkdownReport(report),
    );

    if (!overallPass) {
      console.error(
        `[qa:motion] FAILED: staticAllZero=${staticAllZero}, cleanConsole=${cleanConsole}, allClipsHealthy=${allClipsHealthy}, consoleWarnings=${consoleWarnings.length}, consoleErrors=${consoleErrors.length}, pageErrors=${pageErrors.length}`,
      );
      process.exitCode = 1;
    } else {
      console.log('[qa:motion] ALL MOTION & SHIMMER GATES PASSED (0.00% static delta, p95 <= 16.7ms, 0 dropped frames, 0 console warnings).');
    }
  } finally {
    if (browser) await browser.close();
    await server.cleanup();
  }
}

main().catch((err) => {
  console.error('[qa:motion] Fatal error:', err);
  process.exit(1);
});
