import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { platform } from "os";
import { delimiter } from "path";

export type RuntimeKind = "native" | "wine" | "proton" | "crossover" | "whisky";

export interface RuntimeDetectionResult {
  platform: NodeJS.Platform;
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

function resolveBinaryInPath(binaryName: string): string | undefined {
  const pathValue = process.env.PATH ?? "";
  const folders = pathValue.split(delimiter).filter(Boolean);

  for (const folder of folders) {
    const candidate = `${folder}/${binaryName}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function commandExists(command: string): boolean {
  const check = spawnSync("bash", ["-lc", `command -v ${command}`], {
    encoding: "utf-8"
  });
  return check.status === 0;
}

function detectMacAlternatives(
  notes: string[]
): { winePath?: string; protonPath?: string; crossoverPath?: string; whiskyPath?: string } {
  // Common macOS compatibility wrappers for running Windows binaries.
  let winePath: string | undefined;
  let crossoverPath: string | undefined;
  let whiskyPath: string | undefined;

  const wineCandidates = [
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
    "/usr/local/bin/wine",
    "/opt/homebrew/bin/wine64"
  ];
  for (const path of wineCandidates) {
    if (existsSync(path)) {
      winePath = path;
      notes.push(`Found macOS runtime candidate at ${path}`);
      break;
    }
  }

  const crossoverCandidates = [
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxrun"
  ];
  for (const path of crossoverCandidates) {
    if (existsSync(path)) {
      crossoverPath = path;
      break;
    }
  }

  const whiskyCandidates = ["/Applications/Whisky.app/Contents/MacOS/Whisky"];
  for (const path of whiskyCandidates) {
    if (existsSync(path)) {
      whiskyPath = path;
      break;
    }
  }

  return { winePath, protonPath: undefined, crossoverPath, whiskyPath };
}

export function detectRuntimes(): RuntimeDetectionResult {
  const currentPlatform = platform();
  const notes: string[] = [];

  if (currentPlatform === "win32") {
    return {
      platform: currentPlatform,
      wineDetected: false,
      protonDetected: false,
      crossoverDetected: false,
      whiskyDetected: false,
      suggestedMode: "native",
      notes: ["Windows detected; native launch is preferred."]
    };
  }

  let winePath = resolveBinaryInPath("wine") ?? resolveBinaryInPath("wine64");
  let protonPath = resolveBinaryInPath("proton");
  let crossoverPath: string | undefined;
  let whiskyPath: string | undefined;

  if (!winePath && commandExists("wine")) {
    winePath = "wine";
  }
  if (!protonPath && commandExists("proton")) {
    protonPath = "proton";
  }

  if (currentPlatform === "darwin") {
    const macCandidates = detectMacAlternatives(notes);
    winePath = winePath ?? macCandidates.winePath;
    protonPath = protonPath ?? macCandidates.protonPath;
    crossoverPath = macCandidates.crossoverPath;
    whiskyPath = macCandidates.whiskyPath;
    notes.push("On modern macOS, Wine may require wrappers like Whisky or CrossOver.");
  }

  const wineDetected = Boolean(winePath);
  const protonDetected = Boolean(protonPath);
  const crossoverDetected = Boolean(crossoverPath);
  const whiskyDetected = Boolean(whiskyPath);
  const suggestedMode: RuntimeKind = protonDetected ? "proton" : wineDetected ? "wine" : "native";

  if (!wineDetected && !protonDetected && !crossoverDetected && !whiskyDetected) {
    notes.push("No Wine/Proton binary in PATH; manual path may be required.");
  }

  return {
    platform: currentPlatform,
    wineDetected,
    winePath,
    protonDetected,
    protonPath,
    crossoverDetected,
    crossoverPath,
    whiskyDetected,
    whiskyPath,
    suggestedMode,
    notes
  };
}
