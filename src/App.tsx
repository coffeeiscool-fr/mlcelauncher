import { useEffect, useMemo, useState } from "react";

type Tab = "commits" | "settings" | "options";
type RuntimeMode = "native" | "wine" | "proton" | "crossover" | "whisky";
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
  suggestedMode: RuntimeMode;
  notes: string[];
}

interface GitHubCommit {
  sha: string;
  htmlUrl: string;
  message: string;
  authorName: string;
  date: string;
}

interface GitHubAssetInfo {
  name: string;
  size: number;
  sizeFormatted: string;
  downloadUrl: string;
}

const links = [
  { label: "Minecraft Legacy Index", href: "https://minecraftlegacy.com/" },
  { label: "Minecraft LCE Wiki", href: "https://minecraft.wiki/w/Legacy_Console_Edition" },
  { label: "r/Minecraftlegacymode", href: "https://www.reddit.com/r/Minecraftlegacymode/" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("commits");
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeDetectionResult | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("wine");
  const [manualRuntimePath, setManualRuntimePath] = useState("");
  const [manualArgs, setManualArgs] = useState('WINEDLLOVERRIDES="dinput8=n,b"');
  const [useCompatibilityLayer, setUseCompatibilityLayer] = useState(true);
  const [gamePath, setGamePath] = useState("");
  const [repoUrl, setRepoUrl] = useState("https://github.com/smartcmd/MinecraftConsoles");
  const [username, setUsername] = useState("");
  const [systemOverride, setSystemOverride] = useState<TargetSystem>("windows");
  const [closeAfterLaunch, setCloseAfterLaunch] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [repoError, setRepoError] = useState("");
  const [nightlyFound, setNightlyFound] = useState(false);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [launchStatus, setLaunchStatus] = useState("");
  const [launching, setLaunching] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [zipUpdating, setZipUpdating] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState<{ type: "client" | "zip"; asset: GitHubAssetInfo } | null>(null);
  const [theme, setTheme] = useState<'modern' | 'classic' | 'gradient' | 'oled'>('modern');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [runtimeResult, settings] = await Promise.all([
          window.launcherApi.detectRuntimes(),
          window.launcherApi.getSettings()
        ]);
        setRuntimeInfo(runtimeResult);
        setRepoUrl(settings.repoUrl);
        setGamePath(settings.gamePath);
        setUsername(settings.username);
        setSystemOverride(settings.systemOverride);
        setUseCompatibilityLayer(settings.useCompatibilityLayer);
        setRuntimeMode(settings.runtimeMode);
        setManualRuntimePath(settings.manualRuntimePath);
        setManualArgs(settings.runtimeArgs);
        setCloseAfterLaunch(settings.closeAfterLaunch);
        setOfflineMode(settings.offlineMode);
        setTheme(settings.theme || 'modern');
        if (!settings.offlineMode) {
          await loadRepoActivity(settings.repoUrl);
        }
      } catch {
        setRuntimeInfo(null);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (updateFeedback) {
      const timer = setTimeout(() => {
        setUpdateFeedback(null);
      }, 5000); // 5 seconds
      
      return () => clearTimeout(timer);
    }
  }, [updateFeedback]);

  useEffect(() => {
    if (launchStatus) {
      const timer = setTimeout(() => {
        setLaunchStatus("");
      }, 5000); // 5 seconds
      
      return () => clearTimeout(timer);
    }
  }, [launchStatus]);

  useEffect(() => {
    if (!repoUrl.trim()) return;
    const timeoutId = window.setTimeout(() => {
      void persistSettings();
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [repoUrl, gamePath, username, systemOverride, useCompatibilityLayer, runtimeMode, manualRuntimePath, manualArgs, closeAfterLaunch, offlineMode, theme]);

  const canPlay = useMemo(() => Boolean(gamePath.trim()), [gamePath]);

  const getThemeStyles = (section: 'header' | 'middle' | 'sidebar' | 'footer') => {
    switch (theme) {
      case 'modern':
        switch (section) {
          case 'header':
            return { backgroundImage: 'url("/images/Header Background.png")', backgroundPosition: 'top', backgroundRepeat: 'repeat-x' };
          case 'middle':
            return { backgroundImage: 'url("/images/Middle Section Background.png")', backgroundSize: 'cover', backgroundPosition: 'center' };
          case 'sidebar':
            return { backgroundImage: 'url("/images/Side Bar Background.png")', backgroundSize: 'cover', backgroundPosition: 'center' };
          case 'footer':
            return { backgroundImage: 'url("/images/Footer Background.png")', backgroundSize: 'cover', backgroundPosition: 'center' };
          default:
            return { backgroundImage: 'none' };
        }
      case 'classic':
        switch (section) {
          case 'header':
            return { backgroundImage: 'url("/images/Side Bar Background.png")', backgroundSize: 'cover', backgroundPosition: 'center' };
          case 'middle':
            return { backgroundImage: 'url("/images/Side Bar Background.png")', backgroundSize: 'cover', backgroundPosition: 'center' };
          case 'sidebar':
            return { backgroundImage: 'url("/images/Side Bar Background.png")', backgroundSize: 'cover', backgroundPosition: 'center' };
          case 'footer':
            return { backgroundImage: 'url("/images/Footer Background.png")', backgroundSize: 'cover', backgroundPosition: 'center' };
          default:
            return { backgroundImage: 'none' };
        }
      case 'gradient':
        switch (section) {
          case 'header':
            return { background: 'linear-gradient(135deg, #1a1a2a 0%, #2d2d3d 100%)' };
          case 'middle':
            return { background: 'linear-gradient(135deg, #1a1a2a 0%, #2d2d3d 100%)' };
          case 'sidebar':
            return { background: 'linear-gradient(135deg, #1a1a2a 0%, #2d2d3d 100%)' };
          case 'footer':
            return { background: 'linear-gradient(135deg, #1a1a2a 0%, #2d2d3d 100%)' };
          default:
            return { background: '#1a1a2a' };
        }
      case 'oled':
        switch (section) {
          case 'header':
            return { background: '#000000' };
          case 'middle':
            return { background: '#000000' };
          case 'sidebar':
            return { background: '#000000' };
          case 'footer':
            return { background: '#000000' };
          default:
            return { background: '#000000' };
        }
      default:
        return { backgroundImage: 'none' };
    }
  };

  const runtimeStatusLabel = useMemo(() => {
    if (!runtimeInfo) return "Detecting runtime...";
    const labels: string[] = [];
    if (runtimeInfo.platform === "win32") labels.push("Windows native");
    if (runtimeInfo.protonDetected) labels.push(`Proton (${runtimeInfo.protonPath ?? "PATH"})`);
    if (runtimeInfo.wineDetected) labels.push(`Wine (${runtimeInfo.winePath ?? "PATH"})`);
    if (runtimeInfo.crossoverDetected) labels.push("CrossOver");
    if (runtimeInfo.whiskyDetected) labels.push("Whisky");
    return labels.length > 0 ? labels.join(" | ") : "No runtime detected (set manual path below)";
  }, [runtimeInfo]);

  const persistSettings = async () => {
    setSavingSettings(true);
    try {
      await window.launcherApi.saveSettings({
        repoUrl,
        gamePath,
        username,
        systemOverride,
        useCompatibilityLayer,
        runtimeMode,
        manualRuntimePath,
        runtimeArgs: manualArgs,
        closeAfterLaunch,
        offlineMode,
        theme
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const loadRepoActivity = async (sourceRepoUrl?: string) => {
    setLoadingCommits(true);
    setRepoError("");
    try {
      const data = await window.launcherApi.getRepoActivity((sourceRepoUrl ?? repoUrl).trim());
      setCommits(data.commits);
      setNightlyFound(data.nightlyFound);
    } catch (error) {
      setCommits([]);
      setNightlyFound(false);
      const message = error instanceof Error ? error.message : "Failed to load repository activity.";
      setRepoError(message);
    } finally {
      setLoadingCommits(false);
    }
  };

  const installNightlyClient = async () => {
    setUpdateFeedback(null);
    setUpdating(true);
    try {
      // Get asset info first for confirmation dialog
      const asset = await window.launcherApi.getAssetInfo(repoUrl.trim(), "Minecraft.Client.exe");
      setShowConfirmDialog({ type: "client", asset });
    } catch (error) {
      setUpdateFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Failed to get asset info."
      });
      setUpdating(false);
    }
  };

  const installZipUpdate = async () => {
    setUpdateFeedback(null);
    setZipUpdating(true);
    try {
      // Get asset info first for confirmation dialog
      const asset = await window.launcherApi.getAssetInfo(repoUrl.trim(), "LCEWindows64.zip");
      setShowConfirmDialog({ type: "zip", asset });
    } catch (error) {
      setUpdateFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Failed to get asset info."
      });
      setZipUpdating(false);
    }
  };

  const confirmUpdate = async () => {
    if (!showConfirmDialog) return;

    try {
      if (showConfirmDialog.type === "client") {
        const result = await window.launcherApi.installNightlyClient({
          repoUrl: repoUrl.trim(),
          gamePath: gamePath.trim()
        });
        setUpdateFeedback({ ok: result.ok, message: result.message });
      } else if (showConfirmDialog.type === "zip") {
        const result = await window.launcherApi.installZipUpdate({
          repoUrl: repoUrl.trim(),
          gamePath: gamePath.trim()
        });
        setUpdateFeedback({ ok: result.ok, message: result.message });
      }
    } catch (error) {
      setUpdateFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Update failed."
      });
    } finally {
      setUpdating(false);
      setZipUpdating(false);
      setShowConfirmDialog(null);
    }
  };

  const launchGame = async () => {
    setLaunchStatus("");
    setLaunching(true);
    try {
      const result = await window.launcherApi.launchGame({
        gamePath,
        username,
        systemOverride,
        useCompatibilityLayer,
        runtimeMode,
        manualRuntimePath,
        runtimeArgs: manualArgs,
        closeAfterLaunch,
        offlineMode,
        theme: "modern"
      });
      setLaunchStatus(result.message);
    } catch {
      setLaunchStatus("Failed to launch game.");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#121212] text-textSoft">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col overflow-hidden bg-[#141414]">
<header 
  className="shrink-0 flex items-center justify-between border-b border-white/10 bg-[#121212] px-5 py-3" 
  style={getThemeStyles('header')}
>
 <h1 className="m-0 p-4 flex items-center">
  <img
    src="images/minecraft-legacy-edition-logo.png"
    alt="Minecraft Legacy Edition"
    className="h-12 w-auto max-w-[min(100%,420px)] object-contain object-left sm:h-14"
  />
</h1>
          <div className="flex gap-2">
            <button
              className={`rounded px-4 py-1.5 text-sm ${activeTab === "commits" ? "bg-panelLight text-white" : "bg-black/30 text-gray-300 hover:bg-black/50"}`}
              onClick={() => setActiveTab("commits")}
            >
              Commits
            </button>
            <button
              className={`rounded px-4 py-1.5 text-sm ${activeTab === "settings" ? "bg-panelLight text-white" : "bg-black/30 text-gray-300 hover:bg-black/50"}`}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </button>
            <button
              className={`rounded px-4 py-1.5 text-sm ${activeTab === "options" ? "bg-panelLight text-white" : "bg-black/30 text-gray-300 hover:bg-black/50"}`}
              onClick={() => setActiveTab("options")}
            >
              Options
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_300px]">
          <section className="flex min-h-0 flex-col overflow-hidden border-r border-white/10 bg-[#1a1a1a] p-6" style={getThemeStyles('middle')}>
            {activeTab === "commits" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-5">
                <h2 className="shrink-0 text-3xl font-semibold text-gray-100">Repository Activity</h2>
                {offlineMode ? (
                  <div className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 p-4">
                    <p className="text-sm text-amber-300">Offline mode is enabled. Repository activity is disabled.</p>
                  </div>
                ) : (
                  <div className="shrink-0 rounded border border-white/10 bg-black/20 p-4">
                    <button
                      onClick={() => loadRepoActivity()}
                      disabled={loadingCommits || !repoUrl.trim()}
                      className="rounded px-4 py-2 text-sm text-white bg-[#2a5a3a] hover:bg-[#1f4d2f] disabled:cursor-not-allowed disabled:bg-[#444a57]"
                    >
                      {loadingCommits ? "Loading..." : "Refresh"}
                    </button>
                    {!repoUrl.trim() && (
                      <p className="mt-3 text-xs text-amber-300">
                        GitHub Repository URL field is empty, you can change this in the settings
                      </p>
                    )}
                    {repoUrl.trim() && (
                      <p className={`mt-3 text-xs ${nightlyFound ? "text-emerald-400" : "text-amber-300"}`}>
                        {nightlyFound
                          ? "Nightly release found: repository is update-compatible."
                          : "Nightly release tag not found. Updatable repos must include releases/tag/nightly."}
                      </p>
                    )}
                    {repoError && <p className="mt-2 text-xs text-red-400">{repoError}</p>}
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto rounded border border-white/10 bg-[#0a0a0a] p-4">
                  {offlineMode ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                      <img
                        src="/images/not-loaded.png"
                        alt="Offline mode"
                        className="mb-4 h-16 w-16 opacity-50"
                      />
                      <p className="text-sm text-gray-300">
                        Offline mode is enabled. Disable it in Options to view repository activity.
                      </p>
                    </div>
                  ) : repoError ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                      <img
                        src="/images/not-loaded.png"
                        alt="Error loading"
                        className="mb-4 h-16 w-16 opacity-50"
                      />
                      <p className="text-sm text-gray-300">
                        Failed to load repository activity. Check the repository URL and your connection.
                      </p>
                    </div>
                  ) : commits.length === 0 ? (
                    <p className="p-4 text-sm text-gray-300">
                      No commits loaded yet. Enter a repository and click Refresh.
                    </p>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {commits.map((commit) => (
                        <li key={commit.sha} className="p-4">
                          <a
                            href={commit.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-base font-semibold text-[#2a5a3a] underline underline-offset-4 hover:text-[#1f4d2f]"
                          >
                            {commit.message.split("\n")[0]}
                          </a>
                          <p className="mt-1 text-xs text-gray-300">
                            {commit.authorName} - {new Date(commit.date).toLocaleString()} - {commit.sha.slice(0, 8)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : activeTab === "settings" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-5">
                  <h2 className="text-3xl font-semibold text-white">Launcher Settings</h2>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-gray-300">GitHub Repository URL</p>
                    <input
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                      className="mt-2 w-full rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    />
                    <p className="mt-2 text-xs text-gray-400">
                      This URL is used for commit activity and nightly update eligibility.
                    </p>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-gray-300">Game Directory (LCE files)</p>
                    <div className="mt-2 flex flex-col gap-2 md:flex-row">
                      <input
                        value={gamePath}
                        onChange={(e) => setGamePath(e.target.value)}
                        placeholder="/path/to/LCE/game.exe"
                        className="w-full rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                      />
                      <button
                        onClick={async () => {
                          const selectedPath = await window.launcherApi.pickGameBinary();
                          if (selectedPath) setGamePath(selectedPath);
                        }}
                        className="rounded px-4 py-2 text-sm text-white bg-[#3a4a3a] hover:bg-[#2f3d2f]"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      The launcher validates this path before starting.
                    </p>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-gray-300">Target System</p>
                    <select
                      value={systemOverride}
                      onChange={(e) => setSystemOverride(e.target.value as TargetSystem)}
                      className="mt-2 w-full rounded border border-white/20 bg-black/40 px-2 py-2 text-sm"
                    >
                      <option value="windows">Windows</option>
                      <option value="linux">Linux</option>
                      <option value="macos">macOS</option>
                    </select>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-gray-300">Compatibility Runtime</p>
                    <p className="mt-2 text-sm text-white">{runtimeStatusLabel}</p>

                    <label className="mt-4 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={useCompatibilityLayer}
                        onChange={(e) => setUseCompatibilityLayer(e.target.checked)}
                      />
                      Run with Wine/Proton
                    </label>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <select
                        value={runtimeMode}
                        onChange={(e) => setRuntimeMode(e.target.value as RuntimeMode)}
                        className="rounded border border-white/20 bg-black/40 px-2 py-2 text-sm"
                      >
                        <option value="native">Native</option>
                        <option value="wine">Wine</option>
                        <option value="proton">Proton</option>
                        <option value="crossover">CrossOver</option>
                        <option value="whisky">Whisky</option>
                      </select>
                      <input
                        value={manualRuntimePath}
                        onChange={(e) => setManualRuntimePath(e.target.value)}
                        placeholder="Manual binary path"
                        className="rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                      />
                    </div>

                    <input
                      value={manualArgs}
                      onChange={(e) => setManualArgs(e.target.value)}
                      placeholder="Custom launch args"
                      className="mt-3 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    onClick={persistSettings}
                    disabled={savingSettings}
                    className="rounded px-4 py-2 text-sm text-white bg-[#2a5a3a] hover:bg-[#1f4d2f] disabled:cursor-not-allowed disabled:bg-[#444a57]"
                  >
                    {savingSettings ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            ) : activeTab === "options" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-5">
                  <h2 className="text-3xl font-semibold text-white">Program Options</h2>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-gray-300">Theme</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="theme"
                          value="modern"
                          checked={theme === 'modern'}
                          onChange={() => setTheme('modern')}
                        />
                        Default
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="theme"
                          value="classic"
                          checked={theme === 'classic'}
                          onChange={() => setTheme('classic')}
                        />
                        Classic
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="theme"
                          value="gradient"
                          checked={theme === 'gradient'}
                          onChange={() => setTheme('gradient')}
                        />
                        Gradient
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="theme"
                          value="oled"
                          checked={theme === 'oled'}
                          onChange={() => setTheme('oled')}
                        />
                        OLED Black
                      </label>
                    </div>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-gray-300">Offline Mode</p>
                    <label className="mt-4 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={offlineMode}
                        onChange={(e) => setOfflineMode(e.target.checked)}
                      />
                      Enable offline mode (disables repository features)
                    </label>
                    <p className="mt-2 text-xs text-gray-400">
                      When enabled, the launcher will not attempt to fetch repository activity or updates from GitHub.
                    </p>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-gray-300">Launch Behavior</p>
                    <label className="mt-4 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={closeAfterLaunch}
                        onChange={(e) => setCloseAfterLaunch(e.target.checked)}
                      />
                      Close launcher after launching game
                    </label>
                    <p className="mt-2 text-xs text-gray-400">
                      When enabled, the launcher will automatically close (or hide on macOS) 2 seconds after launching the game.
                    </p>
                  </div>

                  <button
                    onClick={persistSettings}
                    disabled={savingSettings}
                    className="rounded px-4 py-2 text-sm text-white bg-[#2a5a3a] hover:bg-[#1f4d2f] disabled:cursor-not-allowed disabled:bg-[#444a57]"
                  >
                    {savingSettings ? "Saving..." : "Save Options"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="min-h-0 overflow-y-auto border-t border-white/10 bg-[#1a1a1a] p-6 lg:border-l lg:border-t-0" style={getThemeStyles('sidebar')}>
            <h3 className="mb-4 text-2xl font-bold text-white">Links</h3>
            <div className="space-y-2 text-lg">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-[#2a5a3a] underline underline-offset-4 hover:text-[#1f4d2f]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </aside>
        </main>

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="mx-4 max-w-md rounded border border-white/20 bg-[#1a1a1a] p-6">
              <h3 className="mb-4 text-lg font-semibold text-white">
                Download {showConfirmDialog.type === "client" ? "Client" : "Full Update"}?
              </h3>
              <p className="mb-4 text-sm text-gray-300">
                Download {showConfirmDialog.asset.name} ({showConfirmDialog.asset.sizeFormatted}) from the nightly release?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmUpdate}
                  className="rounded px-4 py-2 text-sm text-white bg-[#2a5a3a] hover:bg-[#1f4d2f]"
                >
                  Download
                </button>
                <button
                  onClick={() => {
                    setShowConfirmDialog(null);
                    setUpdating(false);
                    setZipUpdating(false);
                  }}
                  className="rounded px-4 py-2 text-sm text-white bg-[#3a4a3a] hover:bg-[#2f3d2f]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="shrink-0 flex items-center justify-between border-t border-white/10 bg-[#121212] px-5 py-3" style={getThemeStyles('footer')}>
          <div className="flex items-center">
            <img
              src="/images/legacy-edition.png"
              alt="Legacy Edition"
              className="-translate-y-1 h-10 w-auto max-w-[min(100%,280px)] object-contain object-left sm:h-12"
            />
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void installNightlyClient()}
                disabled={!canPlay || updating || offlineMode}
                title="Download Minecraft.Client.exe from the nightly GitHub release into your game folder"
                className="min-w-28 rounded px-4 py-1 text-sm text-white bg-[#2a5a3a] hover:bg-[#1f4d2f] disabled:cursor-not-allowed disabled:bg-[#444a57]"
              >
                {updating ? "Updating…" : "Update client"}
              </button>
              <button
                type="button"
                onClick={() => void installZipUpdate()}
                disabled={!canPlay || zipUpdating || offlineMode}
                title="Download and extract LCEWindows64.zip from the nightly GitHub release"
                className="min-w-28 rounded px-4 py-1 text-sm text-white bg-[#2a5a3a] hover:bg-[#1f4d2f] disabled:cursor-not-allowed disabled:bg-[#444a57]"
              >
                {zipUpdating ? "Updating…" : "Full update"}
              </button>
            </div>
            
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-right text-gray-300">Username:</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-48 rounded border border-white/20 bg-white/95 px-2 py-1 text-black"
                  />
                </label>
                <button
                  onClick={launchGame}
                  disabled={!canPlay || launching}
                  className="min-w-28 rounded px-4 py-1 text-sm text-white bg-[#2a5a3a] hover:bg-[#1f4d2f] disabled:cursor-not-allowed disabled:bg-[#444a57]"
                >
                  {launching ? "Launching..." : "Play"}
                </button>
              </div>
              {updateFeedback ? (
                <p
                  className={`max-w-64 text-xs ${updateFeedback.ok ? "text-emerald-400" : "text-red-400"}`}
                >
                  {updateFeedback.message}
                </p>
              ) : null}
              {launchStatus ? <p className="max-w-64 text-xs text-gray-300">{launchStatus}</p> : null}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
