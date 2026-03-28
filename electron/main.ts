import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { createWriteStream, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join, extname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { spawn, spawnSync, execFile } from "child_process";
import { detectRuntimes, RuntimeKind } from "./runtimeDetector";

const isDev = !app.isPackaged;

interface GitHubCommit {
  sha: string;
  htmlUrl: string;
  message: string;
  authorName: string;
  date: string;
}

interface GitHubRepoActivity {
  owner: string;
  repo: string;
  nightlyFound: boolean;
  commits: GitHubCommit[];
}

type TargetSystem = "windows" | "linux" | "macos";

interface LauncherSettings {
  repoUrl: string;
  gamePath: string;
  username: string;
  systemOverride: TargetSystem;
  useCompatibilityLayer: boolean;
  runtimeMode: RuntimeKind;
  manualRuntimePath: string;
  runtimeArgs: string;
  closeAfterLaunch: boolean;
  offlineMode: boolean;
  theme: 'modern' | 'classic' | 'gradient' | 'oled';
}

interface LaunchRequest {
  gamePath: string;
  username: string;
  systemOverride: TargetSystem;
  useCompatibilityLayer: boolean;
  runtimeMode: RuntimeKind;
  manualRuntimePath: string;
  runtimeArgs: string;
}

interface LaunchResult {
  ok: boolean;
  message: string;
  pid?: number;
}

interface NightlyUpdateResult {
  ok: boolean;
  message: string;
}

interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface ZipUpdateResult {
  ok: boolean;
  message: string;
  extractedFiles?: string[];
}

const NIGHTLY_CLIENT_ASSET = "Minecraft.Client.exe";

const DEFAULT_SETTINGS: LauncherSettings = {
  repoUrl: "https://github.com/smartcmd/MinecraftConsoles",
  gamePath: "",
  username: "",
  systemOverride: "windows",
  useCompatibilityLayer: true,
  runtimeMode: "native",
  manualRuntimePath: "",
  runtimeArgs: 'WINEDLLOVERRIDES="dinput8=n,b"',
  closeAfterLaunch: false,
  offlineMode: false,
  theme: "modern"
};

function settingsPath(): string {
  return join(app.getPath("userData"), "launcher-settings.json");
}

function readSettings(): LauncherSettings {
  const file = settingsPath();
  if (!existsSync(file)) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as Partial<LauncherSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: Partial<LauncherSettings>): LauncherSettings {
  const next = { ...readSettings(), ...settings };
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const normalized = repoUrl.endsWith("/") ? repoUrl.slice(0, -1) : repoUrl;
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== "github.com") return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

function githubApiHeaders(): Record<string, string> {
  const name = app.getName().replace(/[^\w.\-]/g, "-") || "MLCELauncher";
  const version = app.getVersion() || "0.0.0";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub rejects requests without a valid User-Agent (often 403).
    "User-Agent": `${name}/${version} (Electron; +https://github.com/)`
  };
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN)?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function githubDownloadHeaders(): Record<string, string> {
  return {
    ...githubApiHeaders(),
    Accept: "application/octet-stream"
  };
}

async function githubErrorDetail(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const body = JSON.parse(raw) as { message?: string; documentation_url?: string };
    if (body.message) {
      return body.documentation_url ? `${body.message} (${body.documentation_url})` : body.message;
    }
  } catch {
    // use raw snippet
  }
  const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
  return snippet || res.statusText || String(res.status);
}

async function fetchRepoActivity(repoUrl: string): Promise<GitHubRepoActivity> {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repository URL.");
  }

  const { owner, repo } = parsed;
  const headers = githubApiHeaders();

  const nightlyRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/nightly`, {
    headers
  });
  const nightlyFound = nightlyRes.ok;

  const commits: GitHubCommit[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const commitsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
      { headers }
    );

    if (!commitsRes.ok) {
      const detail = await githubErrorDetail(commitsRes);
      throw new Error(`Unable to load commits from GitHub (${commitsRes.status}): ${detail}`);
    }

    const batch = (await commitsRes.json()) as Array<{
      sha: string;
      html_url: string;
      commit: { message: string; author: { name: string; date: string } };
    }>;

    commits.push(
      ...batch.map((item) => ({
        sha: item.sha,
        htmlUrl: item.html_url,
        message: item.commit.message,
        authorName: item.commit.author?.name ?? "Unknown",
        date: item.commit.author?.date ?? ""
      }))
    );

    if (batch.length < perPage) break;
    if (page >= 10) break;
    page += 1;
  }

  return { owner, repo, nightlyFound, commits };
}

async function downloadUrlToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { headers: githubDownloadHeaders(), redirect: "follow" });
  if (!res.ok) {
    const detail = await githubErrorDetail(res);
    throw new Error(`Download failed (${res.status}): ${detail}`);
  }
  if (!res.body) {
    throw new Error("Download returned an empty body.");
  }
  const out = createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), out);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function extractZip(zipPath: string, extractTo: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const extractedFiles: string[] = [];
    
    // Try using unzip command first (more common on Unix systems)
    const unzip = spawn('unzip', ['-o', zipPath, '-d', extractTo]);
    
    unzip.on('close', (code) => {
      if (code === 0) {
        // List extracted files
        try {
          const files = readdirSync(extractTo);
          extractedFiles.push(...files.map(f => join(extractTo, f)));
          resolve(extractedFiles);
        } catch (error) {
          reject(error);
        }
      } else {
        // Fallback to 7z if unzip fails
        const sevenZip = spawn('7z', ['x', zipPath, `-o${extractTo}`, '-y']);
        
        sevenZip.on('close', (code7) => {
          if (code7 === 0) {
            try {
              const files = readdirSync(extractTo);
              extractedFiles.push(...files.map(f => join(extractTo, f)));
              resolve(extractedFiles);
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error(`Both unzip and 7z failed. Exit codes: unzip=${code}, 7z=${code7}`));
          }
        });
        
        sevenZip.on('error', reject);
      }
    });
    
    unzip.on('error', () => {
      // If unzip command doesn't exist, try 7z directly
      const sevenZip = spawn('7z', ['x', zipPath, `-o${extractTo}`, '-y']);
      
      sevenZip.on('close', (code) => {
        if (code === 0) {
          try {
            const files = readdirSync(extractTo);
            extractedFiles.push(...files.map(f => join(extractTo, f)));
            resolve(extractedFiles);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`7z failed with exit code ${code}`));
        }
      });
      
      sevenZip.on('error', reject);
    });
  });
}

async function installNightlyClient(repoUrl: string, gamePath: string): Promise<NightlyUpdateResult> {
  const parsed = parseGitHubRepoUrl(repoUrl.trim());
  if (!parsed) {
    return { ok: false, message: "Invalid GitHub repository URL." };
  }

  const exe = gamePath.trim();
  if (!exe) {
    return { ok: false, message: "Set a game executable path in Settings first." };
  }
  if (!existsSync(exe)) {
    return { ok: false, message: "Game executable path does not exist." };
  }

  const gameDir = dirname(exe);
  const targetPath = join(gameDir, NIGHTLY_CLIENT_ASSET);
  const pendingPath = join(gameDir, `${NIGHTLY_CLIENT_ASSET}.pending`);
  const backupPath = join(gameDir, `${NIGHTLY_CLIENT_ASSET}.bak`);

  const { owner, repo } = parsed;
  const releaseRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/nightly`,
    { headers: githubApiHeaders() }
  );

  if (!releaseRes.ok) {
    const detail = await githubErrorDetail(releaseRes);
    return {
      ok: false,
      message:
        releaseRes.status === 404
          ? "No nightly release found for this repository (tag: nightly)."
          : `Could not load nightly release (${releaseRes.status}): ${detail}`
    };
  }

  const release = (await releaseRes.json()) as {
    tag_name?: string;
    assets?: GitHubAsset[];
  };

  const asset = release.assets?.find((a) => a.name === NIGHTLY_CLIENT_ASSET);
  if (!asset?.browser_download_url) {
    return {
      ok: false,
      message: `Nightly release has no "${NIGHTLY_CLIENT_ASSET}" asset. Check ${owner}/${repo} releases.`
    };
  }

  try {
    if (existsSync(pendingPath)) {
      unlinkSync(pendingPath);
    }
    await downloadUrlToFile(asset.browser_download_url, pendingPath);

    if (existsSync(targetPath)) {
      if (existsSync(backupPath)) {
        unlinkSync(backupPath);
      }
      renameSync(targetPath, backupPath);
    }

    renameSync(pendingPath, targetPath);
  } catch (error) {
    try {
      if (existsSync(pendingPath)) {
        unlinkSync(pendingPath);
      }
    } catch {
      // ignore cleanup errors
    }
    const message = error instanceof Error ? error.message : "Update failed.";
    return { ok: false, message };
  }

  return {
    ok: true,
    message: `Installed nightly ${NIGHTLY_CLIENT_ASSET} (${release.tag_name ?? "nightly"}). Previous file saved as ${NIGHTLY_CLIENT_ASSET}.bak when applicable.`
  };
}

async function installZipUpdate(repoUrl: string, gamePath: string): Promise<ZipUpdateResult> {
  const parsed = parseGitHubRepoUrl(repoUrl.trim());
  if (!parsed) {
    return { ok: false, message: "Invalid GitHub repository URL." };
  }

  const exe = gamePath.trim();
  if (!exe) {
    return { ok: false, message: "Set a game executable path in Settings first." };
  }
  if (!existsSync(exe)) {
    return { ok: false, message: "Game executable path does not exist." };
  }

  const gameDir = dirname(exe);
  const zipAsset = "LCEWindows64.zip";
  const zipPath = join(gameDir, `${zipAsset}.pending`);

  const { owner, repo } = parsed;
  const releaseRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/nightly`,
    { headers: githubApiHeaders() }
  );

  if (!releaseRes.ok) {
    const detail = await githubErrorDetail(releaseRes);
    return {
      ok: false,
      message:
        releaseRes.status === 404
          ? "No nightly release found for this repository (tag: nightly)."
          : `Could not load nightly release (${releaseRes.status}): ${detail}`
    };
  }

  const release = (await releaseRes.json()) as {
    tag_name?: string;
    assets?: GitHubAsset[];
  };

  const asset = release.assets?.find((a) => a.name === zipAsset);
  if (!asset?.browser_download_url) {
    return {
      ok: false,
      message: `Nightly release has no "${zipAsset}" asset. Check ${owner}/${repo} releases.`
    };
  }

  try {
    // Download zip
    if (existsSync(zipPath)) {
      unlinkSync(zipPath);
    }
    await downloadUrlToFile(asset.browser_download_url, zipPath);

    // Extract zip
    const extractedFiles = await extractZip(zipPath, gameDir);

    // Clean up zip file
    unlinkSync(zipPath);

    return {
      ok: true,
      message: `Successfully extracted ${zipAsset} (${release.tag_name ?? "nightly"}). ${extractedFiles.length} files updated.`,
      extractedFiles
    };
  } catch (error) {
    try {
      if (existsSync(zipPath)) {
        unlinkSync(zipPath);
      }
    } catch {
      // ignore cleanup errors
    }
    const message = error instanceof Error ? error.message : "Zip update failed.";
    return { ok: false, message };
  }
}

function parseArgsToEnvAndArgs(raw: string): { env: Record<string, string>; args: string[] } {
  if (!raw.trim()) return { env: {}, args: [] };
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const env: Record<string, string> = {};
  const args: string[] = [];

  for (const token of parts) {
    const cleaned = token.replace(/^"(.*)"$/, "$1");
    const equalIndex = cleaned.indexOf("=");
    if (equalIndex > 0) {
      const key = cleaned.slice(0, equalIndex).trim();
      const value = cleaned.slice(equalIndex + 1).replace(/^"(.*)"$/, "$1");
      if (key) {
        env[key] = value;
        continue;
      }
    }
    args.push(cleaned);
  }

  return { env, args };
}

function commandAvailable(command: string): boolean {
  if (command.includes("/")) return existsSync(command);
  const check = spawnSync("bash", ["-lc", `command -v ${command}`], { encoding: "utf-8" });
  return check.status === 0;
}

function writeUsernameFile(gameExecutablePath: string, username: string): void {
  const folder = dirname(gameExecutablePath);
  const usernamePath = join(folder, "username.txt");
  writeFileSync(usernamePath, username, "utf-8");
}

function launchGame(request: LaunchRequest): LaunchResult {
  const gamePath = request.gamePath.trim();
  if (!gamePath) {
    return { ok: false, message: "Game path is required." };
  }
  if (!existsSync(gamePath)) {
    return { ok: false, message: "Game executable path does not exist." };
  }

  writeUsernameFile(gamePath, request.username.trim());

  const { env: customEnv, args: customArgs } = parseArgsToEnvAndArgs(request.runtimeArgs);
  const env = { ...process.env, ...customEnv };

  const system = request.systemOverride;
  const manualRuntime = request.manualRuntimePath.trim();
  const runtimeBin =
    manualRuntime ||
    ({
      wine: "wine",
      proton: "proton",
      crossover: "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
      whisky: "/Applications/Whisky.app/Contents/MacOS/Whisky",
      native: ""
    }[request.runtimeMode] ?? "");

  let command = "";
  let commandArgs: string[] = [];

  if (system === "windows" && request.runtimeMode === "native") {
    command = gamePath;
    commandArgs = customArgs;
  } else if (request.useCompatibilityLayer) {
    if (!runtimeBin) {
      return { ok: false, message: "No runtime binary configured for compatibility mode." };
    }
    if (request.runtimeMode !== "whisky" && !commandAvailable(runtimeBin)) {
      return { ok: false, message: `Runtime binary not found: ${runtimeBin}` };
    }

    if (request.runtimeMode === "proton") {
      command = runtimeBin;
      commandArgs = ["run", gamePath, ...customArgs];
    } else if (request.runtimeMode === "crossover") {
      command = runtimeBin;
      commandArgs = [gamePath, ...customArgs];
    } else if (request.runtimeMode === "whisky") {
      command = "open";
      commandArgs = ["-a", "Whisky", "--args", gamePath, ...customArgs];
    } else {
      command = runtimeBin;
      commandArgs = [gamePath, ...customArgs];
    }
  } else {
    command = gamePath;
    commandArgs = customArgs;
  }

  const child = spawn(command, commandArgs, {
    detached: false,
    stdio: "ignore",
    env
  });

  if (!child.pid) {
    return { ok: false, message: "Launcher could not start the game process." };
  }

  child.unref();
  
  // Check if we should close after launch
  const settings = readSettings();
  if (settings.closeAfterLaunch) {
    // Delay closing to allow the game to start
    setTimeout(() => {
      if (process.platform !== "darwin") {
        app.quit();
      } else {
        // On macOS, hide the app instead of quitting
        app.hide();
      }
    }, 2000);
  }

  return { ok: true, message: "Game launched.", pid: child.pid };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 1000,
    minHeight: 650,
    title: "Minecraft LCE Launcher",
    autoHideMenuBar: true,
    backgroundColor: "#121212",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(join(process.cwd(), "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = "dark";

  ipcMain.handle("runtime:detect", () => detectRuntimes());
  ipcMain.handle("dialog:pickGameBinary", async () => {
    const selected = await dialog.showOpenDialog({
      title: "Select LCE game executable",
      properties: ["openFile"],
      filters: [
        { name: "Executables", extensions: ["exe", "app", "bin", "x86", "x64"] },
        { name: "All files", extensions: ["*"] }
      ]
    });
    if (selected.canceled || selected.filePaths.length === 0) {
      return null;
    }
    return selected.filePaths[0];
  });
  ipcMain.handle("github:repoActivity", async (_, repoUrl: string) => {
    const settings = readSettings();
    if (settings.offlineMode) {
      throw new Error("Offline mode is enabled. Repository activity is disabled.");
    }
    return fetchRepoActivity(repoUrl);
  });
  ipcMain.handle("github:getAssetInfo", async (_, repoUrl: string, assetName: string) => {
    const parsed = parseGitHubRepoUrl(repoUrl.trim());
    if (!parsed) {
      throw new Error("Invalid GitHub repository URL.");
    }

    const { owner, repo } = parsed;
    const releaseRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/nightly`,
      { headers: githubApiHeaders() }
    );

    if (!releaseRes.ok) {
      const detail = await githubErrorDetail(releaseRes);
      throw new Error(`Could not load nightly release (${releaseRes.status}): ${detail}`);
    }

    const release = (await releaseRes.json()) as {
      tag_name?: string;
      assets?: GitHubAsset[];
    };

    const asset = release.assets?.find((a) => a.name === assetName);
    if (!asset) {
      throw new Error(`Asset "${assetName}" not found in nightly release.`);
    }

    return {
      name: asset.name,
      size: asset.size,
      sizeFormatted: formatBytes(asset.size),
      downloadUrl: asset.browser_download_url
    };
  });
  ipcMain.handle("settings:get", () => readSettings());
  ipcMain.handle("settings:set", (_, settings: Partial<LauncherSettings>) => writeSettings(settings));
  ipcMain.handle("game:launch", (_, payload: LaunchRequest) => {
    try {
      return launchGame(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to launch game.";
      return { ok: false, message } as LaunchResult;
    }
  });
  ipcMain.handle("update:installNightlyClient", (_, payload: { repoUrl: string; gamePath: string }) =>
    installNightlyClient(payload.repoUrl, payload.gamePath)
  );
  ipcMain.handle("update:installZipUpdate", (_, payload: { repoUrl: string; gamePath: string }) =>
    installZipUpdate(payload.repoUrl, payload.gamePath)
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
