import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import electronPath from "electron";
import { createServer } from "vite";

const appName = "Papercase";
const appIdentifier = "com.ajmdz.papercase.dev";
const devBundleVersion = "3";
const rootDir = resolve(import.meta.dirname, "..");
const tscBin = resolve(rootDir, "node_modules/typescript/bin/tsc");

const children = new Set();

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
  });

  children.add(child);
  child.once("exit", () => {
    children.delete(child);
  });

  return child;
}

function runOnce(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnChild(command, args);

    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(
            `${command} ${args.join(" ")} exited with code ${code ?? "null"}`,
          ),
        );
      }
    });
  });
}

function setPlistString(plist, key, value) {
  const keyPattern = new RegExp(
    `(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`,
  );

  if (keyPattern.test(plist)) {
    return plist.replace(keyPattern, `$1${value}$3`);
  }

  return plist.replace(
    "</dict>",
    `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>`,
  );
}

function getPlistString(plist, key) {
  return (
    plist.match(
      new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`),
    )?.[1] ?? ""
  );
}

function ensureMacDevAppBundle() {
  if (process.platform !== "darwin") {
    return electronPath;
  }

  const electronApp = resolve(dirname(electronPath), "../..");
  const electronPlistPath = resolve(electronApp, "Contents/Info.plist");
  const sourcePlist = readFileSync(electronPlistPath, "utf8");
  const sourceVersion = getPlistString(sourcePlist, "CFBundleVersion");
  const sourceSignature = `${devBundleVersion}\n${electronApp}\n${sourceVersion}\n`;
  const devRoot = resolve(rootDir, "out/dev");
  const devApp = resolve(devRoot, `${appName}.app`);
  const markerPath = resolve(devRoot, ".electron-source");

  const existingSignature = existsSync(markerPath)
    ? readFileSync(markerPath, "utf8")
    : "";

  if (!existsSync(devApp) || existingSignature !== sourceSignature) {
    rmSync(devApp, { force: true, recursive: true });
    mkdirSync(devRoot, { recursive: true });
    cpSync(electronApp, devApp, { recursive: true, verbatimSymlinks: true });
  }

  const devPlistPath = resolve(devApp, "Contents/Info.plist");
  const devPlist = readFileSync(devPlistPath, "utf8");
  const nextPlist = [
    ["CFBundleDisplayName", appName],
    ["CFBundleName", appName],
    ["CFBundleIdentifier", appIdentifier],
  ].reduce(
    (plist, [key, value]) => setPlistString(plist, key, value),
    devPlist,
  );

  if (nextPlist !== devPlist) {
    writeFileSync(devPlistPath, nextPlist);
  }

  writeFileSync(markerPath, sourceSignature);

  return resolve(devApp, "Contents/MacOS/Electron");
}

async function shutdown(server, code = 0) {
  for (const child of children) {
    child.kill();
  }

  await server.close();
  process.exit(code);
}

const server = await createServer({
  configFile: resolve(rootDir, "vite.config.ts"),
});

await server.listen();
server.printUrls();

const urls = server.resolvedUrls?.local ?? [];
const rendererUrl = urls[0];

if (!rendererUrl) {
  await shutdown(server, 1);
}

await runOnce(process.execPath, [tscBin, "-p", "tsconfig.node.json"]);

spawnChild(process.execPath, [
  tscBin,
  "-p",
  "tsconfig.node.json",
  "--watch",
  "--preserveWatchOutput",
  "false",
]);

const electron = spawnChild(ensureMacDevAppBundle(), ["."], {
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl,
    NODE_ENV: "development",
  },
});

electron.once("exit", async (code) => {
  await shutdown(server, code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await shutdown(server);
  });
}
