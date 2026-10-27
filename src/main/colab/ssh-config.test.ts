import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSshSnippet, sshHostAlias } from "./ssh-config";

const HOME = "C:\\Users\\John Doe";
const LAUNCHER = "C:\\Users\\John Doe\\.colabdesk\\bin\\colabdesk-proxy.cmd";
const IDENTITY = "C:\\Users\\John Doe\\.ssh\\id_ed25519";

const build = (session: string, identity: string | null = IDENTITY, platform: NodeJS.Platform = "win32") =>
  buildSshSnippet({ session, launcherPath: LAUNCHER, identity, home: HOME, platform });

describe("the SSH snippet", () => {
  it("quotes every path and argument, so a home with spaces cannot break the file", () => {
    const snippet = build("alpha");

    expect(snippet.block).toContain("Host colabdesk-alpha");
    expect(snippet.block).toContain(
      'ProxyCommand "C:/Users/John Doe/.colabdesk/bin/colabdesk-proxy.cmd" ssh --proxy-mode -s "alpha" --identity "C:/Users/John Doe/.ssh/id_ed25519"',
    );
    expect(snippet.block).toContain('IdentityFile "C:/Users/John Doe/.ssh/id_ed25519"');
    expect(snippet.block).toContain("StrictHostKeyChecking no");
    expect(snippet.block).toContain("UserKnownHostsFile NUL");
    expect(snippet.config_path).toBe(join(HOME, ".ssh", "config"));
    expect(snippet.command).toBe("ssh colabdesk-alpha");
    expect(snippet.alias_mapped).toBe(false);
  });

  it("uses /dev/null on POSIX", () => {
    expect(build("alpha", IDENTITY, "linux").block).toContain("UserKnownHostsFile /dev/null");
  });

  it("keeps a plain session name in the alias", () => {
    expect(sshHostAlias("e2e-alpha")).toBe("colabdesk-e2e-alpha");
  });

  it("maps an unsafe name to a stable alias and keeps the real name for -s", () => {
    const first = build("my session");
    const second = build("my session");

    expect(first.alias).toMatch(/^colabdesk-my-session-[0-9a-f]{6}$/);
    expect(first.alias).toBe(second.alias);
    expect(first.alias_mapped).toBe(true);
    expect(first.block).toContain('Host colabdesk-my-session-');
    // The CLI still has to be told the session it actually knows.
    expect(first.block).toContain('-s "my session"');
  });

  it("omits the identity lines when no usable key exists", () => {
    const snippet = build("alpha", null);

    expect(snippet.identity).toBeNull();
    expect(snippet.block).not.toContain("IdentityFile");
    expect(snippet.block).not.toContain("--identity");
    expect(snippet.block).toContain('-s "alpha"');
  });

  it("escapes percent tokens so OpenSSH does not expand them", () => {
    const percent = buildSshSnippet({
      session: "100%",
      launcherPath: "C:\\Users\\100%\\colabdesk-proxy.cmd",
      identity: "C:\\Users\\100%\\id_ed25519",
      home: HOME,
      platform: "win32",
    });

    expect(percent.block).toContain('-s "100%%"');
    expect(percent.block).toContain('ProxyCommand "C:/Users/100%%/colabdesk-proxy.cmd"');
    expect(percent.block).toContain('IdentityFile "C:/Users/100%%/id_ed25519"');
    expect(percent.block).toContain('--identity "C:/Users/100%%/id_ed25519"');
  });

  it("refuses a name that cannot travel in a quoted config line", () => {
    for (const session of ['a"b', "a\\b", "a\nb"]) {
      expect(() => build(session)).toThrow(/无法写入 SSH 配置/);
    }
  });
});
