import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_URL = process.env.QA_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve(process.cwd(), 'qa-artifacts');
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const file of fs.readdirSync(OUT_DIR)) {
  if (file.endsWith('.png')) {
    fs.unlinkSync(path.join(OUT_DIR, file));
  }
}

const CHROME_PATH =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performTouchPullFlick(
  page,
  { startX = 195, startY = 560, pullDy = 120, flickDx = 0, flickUp = true }
) {
  const client = await page.context().newCDPSession(page);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: startX, y: startY, radiusX: 12, radiusY: 12, force: 1, id: 1 },
    ],
  });
  await sleep(45);

  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: Math.round(startX + flickDx * 0.35 * t),
          y: Math.round(startY + pullDy * t),
          radiusX: 12,
          radiusY: 12,
          force: 1,
          id: 1,
        },
      ],
    });
    await sleep(28);
  }

  await sleep(120);

  if (flickUp) {
    const peakY = startY + pullDy;
    for (let j = 1; j <= 3; j++) {
      const f = j / 3;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: Math.round(startX + flickDx * f),
            y: Math.round(peakY - (pullDy * 0.75 + 35) * f),
            radiusX: 12,
            radiusY: 12,
            force: 1,
            id: 1,
          },
        ],
      });
      await sleep(14);
    }
  }

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function performCanvasTap(page, x, y) {
  await page.touchscreen.tap(x, y);
}

async function main() {
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const assertions = {};

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });

  // 1. Instant Sub-1s Drop-In & Route Verification
  const t0 = Date.now();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  const domLoadMs = Date.now() - t0;

  await page.waitForSelector('canvas', { timeout: 8000 });
  const canvasMountedMs = Date.now() - t0;
  await sleep(1100);

  await page.screenshot({
    path: path.join(OUT_DIR, '01-initial-tee-390x844.png'),
  });

  // Check layout metrics, unobstructed portrait ratio, and initial HUD state
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;

    // Measure interactive HUD bounding boxes to verify 90%+ unobstructed 3D view
    const hudBoxes = Array.from(
      document.querySelectorAll('[data-hud-interactive="true"]')
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        width: Math.round(r.width),
        height: Math.round(r.height),
        area: r.width * r.height,
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    });
    const hudInteractiveArea = hudBoxes.reduce((acc, b) => acc + b.area, 0);
    const viewportArea = window.innerWidth * window.innerHeight;
    const unobstructedPct = Number(
      ((1 - hudInteractiveArea / viewportArea) * 100).toFixed(1)
    );

    const bodyText = document.body.innerText;
    const forbiddenJargon = [
      '9-iron',
      'sand wedge',
      'loft',
      'yard',
      'yds',
      'm/s',
      'rpm',
    ];
    const foundJargon = forbiddenJargon.filter((term) =>
      bodyText.toLowerCase().includes(term)
    );

    const oldArcadeTerms = ['sky driver', 'cloud lobber', 'curb skimmer', 'sidewalk putter'];
    const foundOldArcade = oldArcadeTerms.filter((term) =>
      bodyText.toLowerCase().includes(term)
    );

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      hasCanvas: Boolean(canvas),
      canvasWidth: canvasRect?.width ?? 0,
      canvasHeight: canvasRect?.height ?? 0,
      unobstructedPct,
      hudBoxes,
      initialBodyText: bodyText,
      hasInitialWhisperHint: bodyText.includes('Pull down & flick'),
      hasStrokeZero: bodyText.includes('Stroke 0'),
      foundJargon,
      foundOldArcade,
    };
  });

  assertions.instantDropInSub1s = canvasMountedMs < 1000;
  assertions.zeroHorizontalOverflow = metrics.scrollWidth === 390;
  assertions.unobstructedOver90Pct = metrics.unobstructedPct >= 90;
  assertions.hasInitialOnboardingWhisper = metrics.hasInitialWhisperHint;
  assertions.zeroGolfSimJargon = metrics.foundJargon.length === 0;
  assertions.zeroOldArcadeClubNames = metrics.foundOldArcade.length === 0;

  // 2. Test Club Switching across all 4 clubs + verify 3D trajectory arc preview
  const clubChecks = [];
  const clubsToTest = [
    { tapLabel: 'PW', expectedName: 'Pitching Wedge', screenshot: '02a-club-pw-arc.png' },
    { tapLabel: '7i', expectedName: '7-Iron', screenshot: null },
    { tapLabel: 'Putter', expectedName: 'Putter', screenshot: null },
    { tapLabel: 'Driver', expectedName: 'Driver', screenshot: '02-club-arc-preview.png' },
  ];

  for (const c of clubsToTest) {
    const btn = page.getByRole('button', { name: new RegExp(c.tapLabel, 'i') }).first();
    await btn.tap();
    await sleep(280);
    const activeOk = await page.evaluate(
      (expected) => document.body.innerText.includes(expected),
      c.expectedName
    );
    clubChecks.push({ club: c.expectedName, activeOk });
    if (c.screenshot) {
      await page.screenshot({ path: path.join(OUT_DIR, c.screenshot) });
    }
  }
  assertions.allFourClubsSwitchCleanly = clubChecks.every((c) => c.activeOk);

  // 3. Mid-pull 3D dotted trajectory arc + minimal elastic pull bar + Airborne Sky Driver launch
  {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 195, y: 560, radiusX: 12, radiusY: 12, force: 1, id: 2 }],
    });
    for (let i = 1; i <= 5; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: 222, y: 560 + i * 24, radiusX: 12, radiusY: 12, force: 1, id: 2 },
        ],
      });
      await sleep(30);
    }
    await sleep(150);

    const midPullText = await page.evaluate(() => document.body.innerText);
    assertions.midPullZeroNumericPowerReadout = !/\d+\s*(%|yd|m\b|mph)/i.test(
      midPullText
    );
    assertions.midPullCurveChipVisible = midPullText.includes('Curve');

    await page.screenshot({
      path: path.join(OUT_DIR, '03-pull-charging-arc.png'),
    });

    // Flick up to launch Airborne Sky Driver shot!
    for (let j = 1; j <= 3; j++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: 230, y: 680 - j * 45, radiusX: 12, radiusY: 12, force: 1, id: 2 },
        ],
      });
      await sleep(14);
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  }

  await sleep(650);
  await page.screenshot({
    path: path.join(OUT_DIR, '04-driver-airborne.png'),
  });

  // Wait for ball to settle after Stroke 1
  await sleep(3200);
  const afterStroke1 = await page.evaluate(() => ({
    text: document.body.innerText,
    strokeIncrementedTo1: document.body.innerText.includes('Stroke 1'),
    whisperDismissedForever: !document.body.innerText.includes('Pull down & flick'),
  }));
  assertions.strokeIncrementedAfterDriver = afterStroke1.strokeIncrementedTo1;
  assertions.onboardingWhisperDismissedPermanently =
    afterStroke1.whisperDismissedForever;

  // 4. Test Director's Vibe Button (🎬) + Vibe Presets + Zero Sliders + Mulligan + 7-Iron!
  const directorBtn = page.getByRole('button', { name: /Director/i });
  await directorBtn.tap();
  await sleep(300);
  await page.screenshot({
    path: path.join(OUT_DIR, '05-director-vibe-drawer.png'),
  });

  const drawerInspection = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const sliderCount = document.querySelectorAll('input[type="range"]').length;
    const vibeBtns = Array.from(
      dialog ? dialog.querySelectorAll('[role="group"] button') : []
    ).map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: b.textContent?.trim() ?? '',
        width: Math.round(r.width),
        height: Math.round(r.height),
        scrollWidth: b.scrollWidth,
        clientWidth: b.clientWidth,
      };
    });
    return {
      isOpen: Boolean(dialog),
      dialogText: dialog?.textContent ?? '',
      sliderCount,
      vibeBtns,
    };
  });
  assertions.directorDrawerZeroPhysicsSliders =
    drawerInspection.isOpen && drawerInspection.sliderCount === 0;
  assertions.vibeButtonsZeroOverflow =
    drawerInspection.vibeBtns.length === 3 &&
    drawerInspection.vibeBtns.every((b) => b.scrollWidth <= b.clientWidth);

  // Cycle Vibe presets cleanly (Cozy -> Pinball Chaos -> Bouncy)
  await page.getByRole('button', { name: /Cozy/i }).tap();
  await sleep(180);
  await page.getByRole('button', { name: /Pinball Chaos/i }).tap();
  await sleep(180);
  const pinballTaglineOk = await page.evaluate(() =>
    document.body.innerText.includes('Juicy curb ricochets')
  );
  await page.getByRole('button', { name: /Bouncy/i }).tap();
  await sleep(180);
  assertions.vibePresetSwitchingWorks = pinballTaglineOk;

  // Tap 1-Tap Mulligan
  const mulliganBtn = page.getByRole('button', { name: /Mulligan/i });
  await mulliganBtn.tap();
  await sleep(450);
  const afterMulliganStroke0 = await page.evaluate(() =>
    document.body.innerText.includes('Stroke 0')
  );
  assertions.mulliganRevertsStrokeCleanly = afterMulliganStroke0;

  // Switch to 7i and take a zippy low street shot
  const sevenIronBtn = page.getByRole('button', { name: /7i/i }).first();
  await sevenIronBtn.tap();
  await sleep(250);
  await performTouchPullFlick(page, {
    startX: 195,
    startY: 560,
    pullDy: 115,
    flickDx: -10,
    flickUp: true,
  });
  await sleep(2400);
  await page.screenshot({
    path: path.join(OUT_DIR, '06-7i-street-shot.png'),
  });

  // 5. Test 1-Tap Map Peek (full miniature tabletop diorama in 390x844 portrait!)
  const mapPeekBtn = page.getByRole('button', { name: /Map Peek/i });
  await mapPeekBtn.tap();
  await sleep(1150);
  await page.screenshot({
    path: path.join(OUT_DIR, '07-map-peek-diorama.png'),
  });

  // Untoggle Map Peek
  await mapPeekBtn.tap();
  await sleep(500);

  // 6. Test Tap Street to Drop Ball directly onto Parklet Green (zero panning needed!) + Sidewalk Putter Cup Capture!
  await directorBtn.tap();
  await sleep(250);
  const dropModeBtn = page.getByRole('button', {
    name: /Tap Street to Drop Ball/i,
  });
  await dropModeBtn.tap();
  await sleep(1150);

  const dropBannerVisible = await page.evaluate(() =>
    document.body.innerText.includes('Tap street to drop ball')
  );
  assertions.dropBallBannerVisible = dropBannerVisible;
  await page.screenshot({
    path: path.join(OUT_DIR, '08-drop-ball-mode-overview.png'),
  });

  // Tap directly onto the flat AstroTurf Parklet Green ~3.6m West of the Golden Flag (x: 302, y: 300)
  await performCanvasTap(page, 302, 300);
  await sleep(1050);

  // Select Sidewalk Putter and line up facing the Golden Pennant Flag & Cup!
  const putterBtn = page.getByRole('button', { name: /Putter/i }).first();
  await putterBtn.tap();
  await sleep(450);
  await page.screenshot({
    path: path.join(OUT_DIR, '09-parklet-green-putt-lineup.png'),
  });

  // Putt straight along autoYaw directly into the cup!
  let cupped = false;
  for (let attempt = 1; attempt <= 2 && !cupped; attempt++) {
    await performTouchPullFlick(page, {
      startX: 195,
      startY: 560,
      pullDy: 110,
      flickDx: 0,
      flickUp: true,
    });
    for (let waitStep = 0; waitStep < 14; waitStep++) {
      await sleep(250);
      cupped = await page.evaluate(() =>
        document.body.innerText.includes('Sunny Corner!')
      );
      if (cupped) break;
    }
  }

  assertions.cupCaptureAndCelebrationCard = cupped;
  await sleep(300);
  await page.screenshot({
    path: path.join(OUT_DIR, '10-hole-out-celebration.png'),
  });

  // Tap "Play Again" on the Hole-Out Celebration Card and verify Best Score persists!
  if (cupped) {
    const playAgainBtn = page.getByRole('button', { name: /Play Again/i });
    await playAgainBtn.tap();
    await sleep(800);
    const afterPlayAgain = await page.evaluate(() => ({
      hasStroke0: document.body.innerText.includes('Stroke 0'),
      hasPersistedBest: /Best\s+\d+/.test(document.body.innerText),
    }));
    assertions.playAgainResetsAndPersistsBest =
      afterPlayAgain.hasStroke0 && afterPlayAgain.hasPersistedBest;
    await page.screenshot({
      path: path.join(OUT_DIR, '11-play-again-persisted-best.png'),
    });
  }

  // 7. Verify PWA manifest & icon routes respond cleanly with HTTP 200
  const manifestRes = await page.request.get(
    `${TARGET_URL}/manifest.webmanifest`
  );
  const iconRes = await page.request.get(`${TARGET_URL}/icon`);
  const appleIconRes = await page.request.get(`${TARGET_URL}/apple-icon`);

  const pwaRoutes = {
    manifestStatus: manifestRes.status(),
    iconStatus: iconRes.status(),
    appleIconStatus: appleIconRes.status(),
  };
  assertions.pwaRoutesAll200 =
    pwaRoutes.manifestStatus === 200 &&
    pwaRoutes.iconStatus === 200 &&
    pwaRoutes.appleIconStatus === 200;

  const report = {
    domLoadMs,
    canvasMountedMs,
    metrics: {
      innerWidth: metrics.innerWidth,
      innerHeight: metrics.innerHeight,
      scrollWidth: metrics.scrollWidth,
      scrollHeight: metrics.scrollHeight,
      canvasWidth: metrics.canvasWidth,
      canvasHeight: metrics.canvasHeight,
      unobstructedPct: metrics.unobstructedPct,
    },
    pwaRoutes,
    drawerVibeButtons: drawerInspection.vibeBtns,
    assertions,
    consoleErrors,
    consoleWarningsCount: consoleWarnings.length,
    pageErrors,
    screenshots: fs.readdirSync(OUT_DIR).sort(),
  };

  console.log(JSON.stringify(report, null, 2));
  await browser.close();

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('QA Playtest failed:', err);
  process.exit(1);
});
