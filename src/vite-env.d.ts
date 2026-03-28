/// <reference types="vite/client" />

type RuntimeKind = "native" | "wine" | "proton" | "crossover" | "whisky";
type TargetSystem = "windows" | "linux" | "macos";

interface RuntimeDetectionResult {
  platform: string;
  wineDetected: boolean;
  winePath?: string;
  protonDetected: boolean;
  protonPath?: string;
  crossoverDetected: boolean;
  crossoverPath?: string;
  whiskyDetected: boolean;
  whiskyPath?: string;
  suggestedMode: RuntimeKind;
  notes: string[];
}

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

interface LauncherApi {
  detectRuntimes: () => Promise<RuntimeDetectionResult>;
  pickGameBinary: () => Promise<string | null>;
  getRepoActivity: (repoUrl: string) => Promise<GitHubRepoActivity>;
  getAssetInfo: (repoUrl: string, assetName: string) => Promise<GitHubAssetInfo>;
  getSettings: () => Promise<LauncherSettings>;
  saveSettings: (settings: Partial<LauncherSettings>) => Promise<LauncherSettings>;
  launchGame: (payload: Omit<LauncherSettings, "repoUrl">) => Promise<LaunchResult>;
  installNightlyClient: (payload: { repoUrl: string; gamePath: string }) => Promise<NightlyUpdateResult>;
  installZipUpdate: (payload: { repoUrl: string; gamePath: string }) => Promise<ZipUpdateResult>;
}

interface Window {
  launcherApi: LauncherApi;
}
