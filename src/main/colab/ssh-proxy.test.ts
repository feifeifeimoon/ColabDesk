import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCli, type ResolvedCli } from "./cli";
import { ensureProxyLauncher, proxyLauncherContent, proxyLauncherPath } from "./ssh-proxy";

const bundled: ResolvedCli = {
  exe: "C:\\Program Files\\ColabDesk\\resources\\cli\\python\\python.exe",
  prefix: ["-m", "colab_cli.cli"],
  env: {
    PYTHONPATH: "C:\\Program Files\\ColabDesk\\resources\\cli\\site",
    PYTHONUNBUFFERED: "1",
  },
  label: "bundled",
  source: "bundled",
};

const posix: ResolvedCli = {
  exe: "/opt/ColabDesk/resources/cli/python/bin/python3",
  prefix: ["-m", "colab_cli.cli"],
  env: { PYTHONPATH: "/opt/ColabDesk/resources/cli/site" },
  label: "bundled",
  source: "bundled",
};

describe("the proxy launcher", () => {
  it("carries the environment the bundled CLI needs", () => {
    const content = proxyLauncherContent(bundled, "win32");

    expect(content).toContain('set "PYTHONPATH=C:\\Program Files\\ColabDesk\\resources\\cli\\site"');
    expect(content).toContain('set "PYTHONUNBUFFERED=1"');
    expect(content).toContain('"C:\\Program Files\\ColabDesk\\resources\\cli\\python\\python.exe" "-m" "colab_cli.cli" %*');
    expect(content).toContain("if not exist \"C:\\Program Files\\ColabDesk\\resources\\cli\\python\\python.exe\"");
    expect(content).toContain("@chcp 65001 >nul");
    // Only an error is allowed on stderr; the SSH protocol owns stdout.
    expect(content).not.toContain("echo off\r\necho");
  });

  it("writes a POSIX script that execs the CLI with its arguments", () => {
    const content = proxyLauncherContent(posix, "linux");

    expect(content.startsWith("#!/bin/sh\n")).toBe(true);
    expect(content).toContain("export PYTHONPATH='/opt/ColabDesk/resources/cli/site'");
    expect(content).toContain("exec '/opt/ColabDesk/resources/cli/python/bin/python3' '-m' 'colab_cli.cli' \"$@\"");
    expect(content).toContain("if [ ! -x '/opt/ColabDesk/resources/cli/python/bin/python3' ]; then");
  });

  it("survives a quote in a path on POSIX", () => {
    const tricky: ResolvedCli = { ...posix, exe: "/tmp/it's/python3", prefix: [], env: {} };
    expect(proxyLauncherContent(tricky, "linux")).toContain("exec '/tmp/it'\\''s/python3' \"$@\"");
  });

  it("escapes a literal percent for a batch file", () => {
    const percent: ResolvedCli = { ...bundled, env: { PYTHONPATH: "C:\\100%\\site" } };
    expect(proxyLauncherContent(percent, "win32")).toContain('set "PYTHONPATH=C:\\100%%\\site"');
  });

  it("rewrites the launcher only when its command changed, and keeps it executable", () => {
    const home = mkdtempSync(join(tmpdir(), "colabdesk-proxy-"));
    const cli = process.platform === "win32" ? bundled : posix;

    try {
      const path = ensureProxyLauncher(cli, home);
      expect(path).toBe(proxyLauncherPath(home));
      const first = readFileSync(path, "utf8");
      expect(first).toBe(proxyLauncherContent(cli));

      ensureProxyLauncher(cli, home);
      expect(readFileSync(path, "utf8")).toBe(first);

      // No temp file is left behind by the atomic write.
      expect(readdirSync(join(home, ".colabdesk", "bin"))).toEqual([basename(path)]);

      if (process.platform !== "win32") {
        expect(statSync(path).mode & 0o777).toBe(0o700);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  // The part that was broken before this module existed: a bundled runtime
  // needs PYTHONPATH, and the shell that runs `ssh` does not have it. This runs
  // the generated file itself, against whichever CLI this checkout resolves.
  const bundledDir = join(process.cwd(), "resources", "cli");
  const resolved = existsSync(join(bundledDir, "site")) ? resolveCli(bundledDir) : null;

  it.skipIf(!resolved)(
    "runs the resolved CLI when OpenSSH invokes it",
    () => {
      const home = mkdtempSync(join(tmpdir(), "colabdesk-proxy-run-"));
      try {
        const launcher = ensureProxyLauncher(resolved!, home);
        const result = spawnSync(launcher, ["version"], {
          encoding: "utf8",
          shell: process.platform === "win32",
          timeout: 30_000,
        });

        expect(result.error).toBeUndefined();
        expect(result.stderr).not.toContain("ModuleNotFoundError");
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/Version:\s*\d+\.\d+\.\d+/);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
