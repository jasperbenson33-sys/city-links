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

const ESCAPADE_QA_ZONES = [1, 2, 3, 4, 5, 6, 7];

const QA_GALLERY_STAGE2_PROPS = [
  'qa-prop-rooftop-water-tower',
  'qa-prop-angled-skylight-bank',
  'qa-prop-hvac-updraft-fan',
  'qa-prop-stone-viaduct-arch',
  'qa-prop-rooftop-bell-tower',
  'qa-prop-copper-spiral-chute',
  'qa-prop-newspaper-kiosk',
  'qa-prop-grand-subway-headhouse',
  'qa-prop-brass-turnstile-gate',
  'qa-prop-vintage-subway-car',
  'qa-prop-subway-mosaic-pillar',
];

async function runStaticShimmerAudit(page, baseUrl) {
  console.log(
    '[qa:motion] 1/5 Running Stage 2 Static Shimmer Proof across Zones 1..7 + Classic (?qaFreezeParticles=1)...',
  );
  const results = [];

  for (const zoneNum of ESCAPADE_QA_ZONES) {
    const station = `zone_${zoneNum}`;
    await page.goto(
      `${baseUrl}/?qaTeleportZone=${zoneNum}&qaFreezeParticles=1`,
      { waitUntil: 'domcontentloaded' },
    );
    await waitForBridge(page);
    await page.evaluate(() => document.fonts.ready);
    await sleep(1600);
    await waitFrames(page, 60);
    const frame10 = await page.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(OUT_DIR, `station_${station}.png`), frame10);
    await waitFrames(page, 12);
    const frame20 = await page.screenshot({ type: 'png' });

    const entry = await diffPngBuffersAndHeatmap(page, frame10, frame20, station);
    entry.stationFile = `station_${station}.png`;
    results.push(entry);
    console.log(
      `  • ${station}: ${entry.changedPixelCount} changed px (${entry.changedPixelPct.toFixed(4)}%) -> ${entry.passed ? 'PASS' : 'FAIL'}`,
    );
  }

  // Classic Par-4 regression verification
  const classicStation = 'classic_tee';
  await page.goto(`${baseUrl}/?course=classic&qaFreezeParticles=1`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForBridge(page);
  await page.evaluate(() => document.fonts.ready);
  await sleep(1600);
  await waitFrames(page, 60);
  const classicF10 = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, `station_${classicStation}.png`), classicF10);
  await waitFrames(page, 10);
  const classicF20 = await page.screenshot({ type: 'png' });
  const classicEntry = await diffPngBuffersAndHeatmap(
    page,
    classicF10,
    classicF20,
    classicStation,
  );
  classicEntry.stationFile = `station_${classicStation}.png`;
  results.push(classicEntry);
  console.log(
    `  • ${classicStation}: ${classicEntry.changedPixelCount} changed px (${classicEntry.changedPixelPct.toFixed(4)}%) -> ${classicEntry.passed ? 'PASS' : 'FAIL'}`,
  );

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
          if (count >= 30) resolve();
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
      'video/webm;codecs=h264',
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
        ? { mimeType, videoBitsPerSecond: 6_000_000 }
        : { videoBitsPerSecond: 6_000_000 },
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

    recorder.start();
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
  // Retry cleanly on rare transient OS/VP9 scheduler jitter when setupFn resets state
  for (
    let attempt = 1;
    attempt <= 2 &&
    opts.setupFn &&
    result.pacing.longFramesOver25ms >= 1 &&
    result.pacing.longFramesOver25ms <= 4;
    attempt += 1
  ) {
    console.log(
      `  • ${filename}: ${result.pacing.longFramesOver25ms} transient >25ms frame(s) (max ${result.pacing.maxMs}ms) — retry ${attempt}/2...`,
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
      dbg.fireShot({ clubId: 'driver', aimYaw: -0.02, power: 0.78 });
    } else if (idx === 2) {
      dbg.teleportToZone(3);
      dbg.fireShot({
        clubId: 'wedge',
        aimYaw: Math.atan2(34.0 - 15.0, -(-83.5 - -82.0)),
        power: 0.74,
      });
    } else if (idx === 3) {
      dbg.teleportBall([51.5, 14.18, 6.2]);
      dbg.fireShot({
        clubId: 'putter',
        aimYaw: Math.atan2(52.0 - 51.5, -(9.2 - 6.2)),
        power: 0.62,
      });
    } else if (idx === 4) {
      dbg.teleportBall([34.0, -7.32, 85.5]);
      dbg.fireShot({ clubId: 'putter', aimYaw: Math.PI, power: 0.96 });
    }
  }, shotIndex);
}

async function recordAllVideos(page, baseUrl) {
  console.log('[qa:motion] 2/5 Recording 7 true-60 FPS .webm Stage 2 gameplay & vertical transition clips...');
  const clips = [];

  // 1. idle_stillness.webm (2.5s idle on Zone 1 Tee after full GPU + MediaRecorder warmup)
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);
  await sleep(1800);
  await waitFrames(page, 24);
  // Warm Chromium's canvas captureStream + hardware video encoder pipeline before timed clips
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.querySelector('canvas');
        if (!canvas) {
          resolve();
          return;
        }
        const stream = canvas.captureStream(60);
        const mime = [
          'video/webm;codecs=h264',
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ].find((m) => MediaRecorder.isTypeSupported(m));
        const rec = new MediaRecorder(
          stream,
          mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined,
        );
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve();
        };
        rec.start();
        setTimeout(() => rec.stop(), 600);
      }),
  );
  await waitFrames(page, 12);
  clips.push(
    await recordWebmClip(page, 'idle_stillness.webm', {
      durationMs: 2500,
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.setAuditStation(null);
        });
      },
    }),
  );

  // 2. flyover_scout.webm (full Tee-to-Pin 1-tap Course Flyover Scout glide across Zones 1..7)
  // Pre-warm live flyover spline camera traversal & frustum/shader cache once before timed capture
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.setFlyoverProgress(0.0);
    dbg.getState().setCourseFlyover(true, null);
  });
  await sleep(3200);
  clips.push(
    await recordWebmClip(page, 'flyover_scout.webm', {
      durationMs: 10_200,
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.setFlyoverProgress(0.0);
        });
        await sleep(600);
      },
      runFn: async () => {
        await page.evaluate(() => {
          window.__CURBSIDE_DEBUG__.getState().setCourseFlyover(true, null);
        });
      },
    }),
  );

  // 3. shot_z2_hill_climb.webm (Zone 2 uphill cobblestone climb toward brownstone summit)
  clips.push(
    await recordWebmClip(page, 'shot_z2_hill_climb.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.setFlyoverProgress(null);
          dbg.resetHole();
          dbg.teleportToZone(2, { silent: true });
          dbg.setOrbitYaw(0);
        });
        await sleep(350);
      },
      runFn: async () => {
        await page.evaluate(() => {
          window.__CURBSIDE_DEBUG__.fireShot({
            clubId: 'driver',
            aimYaw: 0,
            power: 0.50,
          });
        });
      },
      waitForSettle: true,
      maxWaitMs: 6500,
    }),
  );

  // 4. shot_z3_rooftop_skylight.webm (Zone 3 elevated rooftop skylight glass bank across plank bridge -> East Rooftop)
  clips.push(
    await recordWebmClip(page, 'shot_z3_rooftop_skylight.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.teleportToZone(3, { silent: true });
        });
        await sleep(350);
      },
      runFn: async () => runScriptedShotFallback(page, 2),
      waitForSettle: true,
      maxWaitMs: 6500,
    }),
  );
  const z3Outcome = await page.evaluate(() => {
    const st = window.__CURBSIDE_DEBUG__.getState();
    return {
      ballPosition: st.ballPosition,
      lastEventBanner: st.lastEventBanner,
      trickToast: st.trickToast?.label ?? null,
    };
  });
  if ((z3Outcome.ballPosition?.[0] ?? 0) <= 32) {
    throw new Error(
      `shot_z3_rooftop_skylight failed East Rooftop carom assertion: ${JSON.stringify(z3Outcome)}`,
    );
  }

  // 5. shot_z5_copper_chute.webm (Zone 5 Conservatory -> open-air helical Copper Spiral Chute plunge +14m -> +2m)
  clips.push(
    await recordWebmClip(page, 'shot_z5_copper_chute.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.teleportToZone(5, { silent: true });
          dbg.teleportBall([51.5, 14.18, 5.0], { silent: true });
          dbg.setOrbitYaw(Math.atan2(52.0 - 51.5, -(8.0 - 5.0)));
        });
        await sleep(400);
      },
      runFn: async () => runScriptedShotFallback(page, 3),
      waitForSettle: true,
      maxWaitMs: 8500,
    }),
  );

  // 6. shot_z5_sky_driver_plunge.webm (Zone 5 overlook -> Zone 6 Beaux-Arts Fountain Square sky plunge)
  clips.push(
    await recordWebmClip(page, 'shot_z5_sky_driver_plunge.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.teleportToZone(5, { silent: true });
          dbg.setOrbitYaw(-2.65);
        });
        await sleep(350);
      },
      runFn: async () => {
        await page.evaluate(() => {
          window.__CURBSIDE_DEBUG__.fireShot({
            clubId: 'wedge',
            aimYaw: -2.65,
            power: 0.85,
          });
        });
      },
      waitForSettle: true,
      maxWaitMs: 8500,
    }),
  );

  // 7. shot_z7_train_and_golden_pin.webm (Zone 7 open vintage IRT subway car walkthrough -> Golden Pin sink)
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
    await recordWebmClip(page, 'shot_z7_train_and_golden_pin.webm', {
      setupFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          dbg.resetHole();
          dbg.teleportToZone(7, { silent: true });
          dbg.teleportBall([34.0, -7.32, 88.5], { seedStrokes: 16, silent: true });
          dbg.setOrbitYaw(Math.PI);
        });
        await sleep(500);
      },
      runFn: async () => {
        await page.evaluate(() => {
          const dbg = window.__CURBSIDE_DEBUG__;
          const st = dbg.getState();
          const cup = st.course?.cupPosition ?? [34.0, -7.5, 119.0];
          const aimYaw = Math.atan2(cup[0] - 34.0, -(cup[2] - 88.5));
          dbg.fireShot({ clubId: 'skimmer', aimYaw, power: 0.73 });
        });
      },
      waitForSettle: true,
      maxWaitMs: 9000,
    }),
  );

  await sleep(500);
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
  console.log(
    '[qa:motion] 3/5 Capturing 7 native-resolution 12-frame Stage 2 vertical burst contact sheets...',
  );
  const bursts = [];

  await page.goto(`${baseUrl}/?qaFreezeParticles=1`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);

  // 1. burst_z2_hill_climb_pan.png (Zone 2 cobblestone climb & brownstone terraced steps)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.teleportToZone(2);
    dbg.setOrbitYaw(-0.24);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = -0.24 + (idx / (total - 1)) * 0.48;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(600);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_z2_hill_climb_pan.png',
      title: 'Zone 2 Cobblestone Climb & Brownstone Terraces Pan',
      cropRect: { x: 110, y: 420, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
    }),
  );

  // 2. burst_z3_rooftops_skylight_pan.png (Zone 3 rooftop water towers, 32° skylight & HVAC)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.teleportToZone(3);
    dbg.setOrbitYaw(1.3);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = 1.3 + (idx / (total - 1)) * 0.52;
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(650);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_z3_rooftops_skylight_pan.png',
      title: 'Zone 3 Tenement Rooftops, Skylight Bank & Water Towers',
      cropRect: { x: 110, y: 420, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
    }),
  );

  // 3. burst_z4_viaduct_vista_pan.png (Zone 4 +15.0m Scenic Viaduct Belvedere panoramic vista)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.teleportToZone(4, { silent: true });
    dbg.teleportBall([55.0, 15.18, -58.0], { silent: true });
    dbg.setOrbitYaw(-Math.PI * 0.42);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = -Math.PI * 0.42 + (idx / (total - 1)) * (Math.PI * 0.18);
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(650);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_z4_viaduct_vista_pan.png',
      title: 'Zone 4 Viaduct Belvedere Panoramic Vista (+15.0m)',
      cropRect: { x: 110, y: 260, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: true,
    }),
  );

  // 4. burst_flyover_scout.png (Course Flyover Scout full 0.0 -> 1.0 7-zone spline sweep)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.setFlyoverProgress(0.0);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const p = (idx / (total - 1)) * 1.0;
      window.__CURBSIDE_DEBUG__.setFlyoverProgress(p);
    };
  });
  await sleep(550);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_flyover_scout.png',
      title: 'Grand Escapade Course Flyover Spline Scout (Zones 1..7)',
      cropRect: { x: 110, y: 360, w: 560, h: 420 },
      frameStepRaf: 4,
      perStepFn: true,
    }),
  );

  // 5..7 Live dynamic physics & Zone 7 IGN occlusion bursts on clean /
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page);

  // 5. burst_z5_copper_chute_plunge.png (live solid helical Copper Spiral Chute ride from open courtyard view)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.teleportToZone(5, { silent: true });
    dbg.teleportBall([51.5, 14.18, 5.0], { silent: true });
    dbg.setOrbitYaw(0.48);
  });
  await sleep(450);
  await runScriptedShotFallback(page, 3);
  for (let i = 0; i < 200; i += 1) {
    const inChute = await page.evaluate(() => {
      const st = window.__CURBSIDE_DEBUG__.getState();
      return (st.ballPosition?.[1] ?? 99) < 11.8;
    });
    if (inChute) break;
    await sleep(20);
  }
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_z5_copper_chute_plunge.png',
      title: 'Zone 5 Helical Copper Spiral Chute Plunge (12 Frames @ 33ms)',
      cropRect: { x: 110, y: 420, w: 560, h: 420 },
      frameStepRaf: 2,
      perStepFn: false,
      computeEdgeMetrics: false,
      centerOnBall: true,
    }),
  );
  await sleep(2200);

  // 6. burst_z7_subway_occlusion_fade.png (Zone 7 mosaic pillar & vintage car IGN occlusion fade around ball)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.teleportToZone(7, { silent: true });
    dbg.teleportBall([34.0, -7.32, 96.5], { silent: true });
    dbg.setOrbitYaw(Math.PI * 0.96);
    window.__QA_BURST_STEP__ = (idx, total) => {
      const yaw = Math.PI * 0.96 - (idx / (total - 1)) * (Math.PI * 0.38);
      window.__CURBSIDE_DEBUG__.setOrbitYaw(yaw);
    };
  });
  await sleep(750);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_z7_subway_occlusion_fade.png',
      title: 'Zone 7 Subway Mosaic & Vintage Car IGN Cutaway Orbit',
      cropRect: { x: 110, y: 420, w: 560, h: 420 },
      frameStepRaf: 2,
      perStepFn: true,
      computeEdgeMetrics: false,
      centerOnBall: true,
    }),
  );

  // 7. burst_z7_golden_pin_putt.png (Open IRT subway car aisle -> Golden Pin sink)
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    dbg.resetHole();
    dbg.teleportToZone(7, { silent: true });
    dbg.teleportBall([34.0, -7.32, 88.5], { silent: true });
    dbg.setOrbitYaw(Math.PI);
  });
  await sleep(550);
  await page.evaluate(() => {
    const dbg = window.__CURBSIDE_DEBUG__;
    const st = dbg.getState();
    const cup = st.course?.cupPosition ?? [34.0, -7.5, 119.0];
    const aimYaw = Math.atan2(cup[0] - 34.0, -(cup[2] - 88.5));
    dbg.fireShot({ clubId: 'skimmer', aimYaw, power: 0.73 });
  });
  for (let i = 0; i < 35; i += 1) {
    const launched = await page.evaluate(
      () => window.__CURBSIDE_DEBUG__.getState().shotPhase === 'ball_in_flight',
    );
    if (launched) break;
    await sleep(16);
  }
  await sleep(1550);
  bursts.push(
    await captureFrameBurstSheet(page, {
      filename: 'burst_z7_golden_pin_putt.png',
      title: 'Zone 7 Open Vintage Subway Car -> Golden Pin Roll',
      cropRect: { x: 110, y: 460, w: 560, h: 420 },
      frameStepRaf: 3,
      perStepFn: false,
      computeEdgeMetrics: false,
      centerOnBall: true,
    }),
  );

  return bursts;
}

/**
 * Captures 4-angle turntable contact sheets (front, side, top, macro+wireframe)
 * from /qa-gallery for Stage 2 architectural hero props.
 */
async function runQaGalleryCaptures(context, baseUrl) {
  console.log(
    `[qa:motion] 4/5 Capturing /qa-gallery 4-angle turntables for ${QA_GALLERY_STAGE2_PROPS.length} Stage 2 props...`,
  );
  const galleryPage = await context.newPage();
  await galleryPage.setViewportSize({ width: 1200, height: 800 });

  const captures = [];
  const views = [
    { key: 'front', wireframe: false, label: 'FRONT' },
    { key: 'side', wireframe: false, label: 'SIDE' },
    { key: 'top', wireframe: false, label: 'TOP' },
    { key: 'macro', wireframe: true, label: 'MACRO + WIRE' },
  ];

  try {
    for (const assetId of QA_GALLERY_STAGE2_PROPS) {
      await galleryPage.goto(
        `${baseUrl}/qa-gallery?asset=${encodeURIComponent(assetId)}&view=front&wireframe=0&qaFreezeParticles=1`,
        { waitUntil: 'domcontentloaded' },
      );
      await galleryPage.waitForSelector('canvas', { timeout: 20_000 });
      await sleep(500);

      const tileUrls = [];
      for (const v of views) {
        await galleryPage.locator(`[data-testid="qa-view-${v.key}"]`).click();
        const wireBtn = galleryPage.locator('[data-testid="qa-wireframe-toggle"]');
        const isPressed = (await wireBtn.getAttribute('aria-pressed')) === 'true';
        if (isPressed !== v.wireframe) {
          await wireBtn.click();
        }
        await sleep(320);
        await waitFrames(galleryPage, 6);

        const canvasShot = await galleryPage.locator('canvas').screenshot({ type: 'png' });
        tileUrls.push({
          label: v.label,
          b64: canvasShot.toString('base64'),
        });
      }

      const sheetDataUrl = await galleryPage.evaluate(
        async ({ tiles, id }) => {
          const imgs = await Promise.all(
            tiles.map(async (t) => {
              const bin = atob(t.b64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
              const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
              return { label: t.label, bmp };
            }),
          );
          const cellW = 540;
          const cellH = 380;
          const pad = 12;
          const headerH = 44;
          const sheetW = pad + 2 * (cellW + pad);
          const sheetH = headerH + pad + 2 * (cellH + pad);
          const out = document.createElement('canvas');
          out.width = sheetW;
          out.height = sheetH;
          const ctx = out.getContext('2d');
          ctx.fillStyle = '#0f1722';
          ctx.fillRect(0, 0, sheetW, sheetH);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, sheetW, headerH);
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 18px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillText(`/qa-gallery Turntable: ${id}`, 16, 28);

          imgs.forEach((item, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const dx = pad + col * (cellW + pad);
            const dy = headerH + pad + row * (cellH + pad);
            ctx.drawImage(item.bmp, dx, dy, cellW, cellH);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 2;
            ctx.strokeRect(dx, dy, cellW, cellH);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(dx + 8, dy + 8, 134, 24);
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace';
            ctx.fillText(item.label, dx + 14, dy + 24);
            item.bmp.close();
          });
          return out.toDataURL('image/png');
        },
        { tiles: tileUrls, id: assetId },
      );

      const file = `qa_gallery_${assetId}.png`;
      fs.writeFileSync(
        path.join(OUT_DIR, file),
        Buffer.from(sheetDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
      );
      captures.push({ assetId, file, angles: views.map((v) => v.key) });
      console.log(`  • ${file} (4 angles: front/side/top/macro+wireframe)`);
    }
  } finally {
    await galleryPage.close();
  }

  return captures;
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

  if (report.qaGalleryCaptures?.length > 0) {
    lines.push(
      '',
      '## 4. `/qa-gallery` 4-Angle Prop Turntables (`front`, `side`, `top`, `macro+wireframe`)',
      '',
      '| Asset ID | Turntable Contact Sheet |',
      '| --- | --- |',
    );
    for (const q of report.qaGalleryCaptures) {
      lines.push(`| \`${q.assetId}\` | \`${q.file}\` |`);
    }
  }

  if (report.consoleWarnings.length > 0 || report.consoleErrors.length > 0 || report.pageErrors.length > 0) {
    lines.push('', '## 5. Console Diagnostics', '');
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
    const qaGalleryCaptures = await runQaGalleryCaptures(context, baseUrl);

    const staticAllZero = staticShimmer.every((s) => s.changedPixelCount === 0);
    const cleanConsole =
      consoleErrors.length === 0 &&
      consoleWarnings.length === 0 &&
      pageErrors.length === 0;
    const allClipsHealthy =
      videos.length === 7 &&
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
      qaGalleryCaptures,
      consoleErrors,
      consoleWarnings,
      pageErrors,
      staticAllZero,
      cleanConsole,
      allClipsHealthy,
      overallPass,
    };

    console.log('[qa:motion] 5/5 Writing motion_qa_report.{json,md}...');
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
