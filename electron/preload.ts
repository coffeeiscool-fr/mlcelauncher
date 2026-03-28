import { contextBridge, ipcRenderer } from "electron";
import type { RuntimeDetectionResult } from "./runtimeDetector";

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
type RuntimeMode = "native" | "wine" | "proton" | "crossover" | "whisky";

interface LauncherSettings {
  repoUrl: string;
  gamePath: string;
  username: string;
  systemOverride: TargetSystem;
  useCompatibilityLayer: boolean;
  runtimeMode: RuntimeMode;
  manualRuntimePath: string;
  runtimeArgs: string;
  closeAfterLaunch: boolean;
  offlineMode: boolean;
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

interface ZipUpdateResult {
  ok: boolean;
  message: string;
  extractedFiles?: string[];
}

interface GitHubAssetInfo {
  name: string;
  size: number;
  sizeFormatted: string;
  downloadUrl: string;
}

const api = {
  detectRuntimes: (): Promise<RuntimeDetectionResult> => ipcRenderer.invoke("runtime:detect"),
  pickGameBinary: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickGameBinary"),
  getRepoActivity: (repoUrl: string): Promise<GitHubRepoActivity> => ipcRenderer.invoke("github:repoActivity", repoUrl),
  getAssetInfo: (repoUrl: string, assetName: string): Promise<GitHubAssetInfo> => 
    ipcRenderer.invoke("github:getAssetInfo", repoUrl, assetName),
  getSettings: (): Promise<LauncherSettings> => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: Partial<LauncherSettings>): Promise<LauncherSettings> => ipcRenderer.invoke("settings:set", settings),
  launchGame: (payload: Omit<LauncherSettings, "repoUrl">): Promise<LaunchResult> => ipcRenderer.invoke("game:launch", payload),
  installNightlyClient: (payload: { repoUrl: string; gamePath: string }): Promise<NightlyUpdateResult> =>
    ipcRenderer.invoke("update:installNightlyClient", payload),
  installZipUpdate: (payload: { repoUrl: string; gamePath: string }): Promise<ZipUpdateResult> =>
    ipcRenderer.invoke("update:installZipUpdate", payload)
};

contextBridge.exposeInMainWorld("launcherApi", api);
