/**
 * Records docs/playground.gif: Vite playground with Monaco, typing .tsq and live TS output.
 * Requires: pnpm run build, ffmpeg in PATH, pnpm exec playwright install chromium
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const docsDir = path.join(root, "docs");
const outGif = path.join(docsDir, "playground.gif");
const videoDir = path.join(root, ".tmp-playground-video");

/** Same default sample as apps/playground/src/initialTsq.ts — typing it shows codegen filling in. */
const SAMPLE_TSQ = `@driver postgres

@input
  companyId  string
  speciesId? string
  from       Date
  to         Date

@query getPestReport
  SELECT
    s.name AS species_name,
    COUNT(*)::int AS total,
    AVG(s.severity)::float8 AS avg_severity,
    ps.location AS location
  FROM pest_sightings ps
  JOIN species s ON s.id = ps.species_id
  WHERE ps.company_id = {companyId}
    AND ps.created_at BETWEEN {from} AND {to}
    [IF speciesId]
    AND ps.species_id = {speciesId}::uuid
    [/IF]
  GROUP BY s.name, ps.location
  ORDER BY total DESC

@output
  species_name  string
  total          number
  avg_severity   number
  location       string
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function runFfmpeg(webmPath, gifPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      webmPath,
      "-vf",
      "fps=10,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
      "-loop",
      "0",
      gifPath,
    ];
    const p = spawn("ffmpeg", args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

async function main() {
  fs.mkdirSync(docsDir, { recursive: true });
  if (fs.existsSync(videoDir)) {
    fs.rmSync(videoDir, { recursive: true });
  }
  fs.mkdirSync(videoDir, { recursive: true });

  const vite = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", "5174", "--strictPort"],
    {
      cwd: path.join(root, "apps/playground"),
      stdio: "pipe",
      env: { ...process.env },
    },
  );

  let viteExited;
  const viteExitPromise = new Promise((resolve) => {
    vite.on("close", resolve);
    viteExited = resolve;
  });

  try {
    await waitForHttp("http://127.0.0.1:5174/");

    const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A";

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    });
    const page = await context.newPage();

    await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: "TSQL-X Playground" })
      .waitFor({ state: "visible" });
    await page.locator(".monaco-editor").first().waitFor({ state: "visible" });

    await sleep(1200);

    await page
      .locator(".panels .panel")
      .first()
      .locator(".monaco-editor")
      .click();
    await page.keyboard.press(selectAll);
    await page.keyboard.press("Backspace");
    await sleep(350);

    const typingMs = 15;
    await page.keyboard.type(SAMPLE_TSQ, { delay: typingMs });

    await sleep(2500);

    await context.close();
    await browser.close();

    const webm = fs.readdirSync(videoDir).find((f) => f.endsWith(".webm"));
    if (!webm) {
      throw new Error("No WebM recorded — check Playwright video path");
    }
    await runFfmpeg(path.join(videoDir, webm), outGif);
    fs.rmSync(videoDir, { recursive: true });

    console.log(`Wrote ${outGif}`);
  } finally {
    vite.kill("SIGTERM");
    await Promise.race([viteExitPromise, sleep(5000)]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
