import { describe, expect, it } from "vitest";
import { buildBlock, stripBlock } from "./ssh-config";

const CLI = "C:/tools/colab.exe";

describe("managed blocks", () => {
  it("writes a host with the given proxy command", () => {
    const block = buildBlock("abc123", `"${CLI}" ssh --proxy-mode -s abc123`);
    expect(block).toContain("Host colabdesk-abc123");
    expect(block).toContain(`ProxyCommand "${CLI}" ssh --proxy-mode -s abc123`);
    expect(block).toContain("StrictHostKeyChecking no");
  });

  it("preserves unrelated config when stripping", () => {
    const existing = "Host github.com\n    User git\n    IdentityFile ~/.ssh/id_ed25519\n";
    const { text, found } = stripBlock(existing, "colabdesk-abc123");
    expect(found).toBe(false);
    expect(text).toContain("Host github.com");
    expect(text).toContain("IdentityFile ~/.ssh/id_ed25519");
  });

  it("replaces only our block and leaves no blank-line buildup", () => {
    const existing =
      "Host keep-me\n    User someone\n\n" +
      "# >>> ColabDesk managed block: colabdesk-old >>>\n" +
      "Host colabdesk-old\n    User root\n" +
      "# <<< ColabDesk managed block: colabdesk-old <<<\n";
    const { text, found } = stripBlock(existing, "colabdesk-old");
    expect(found).toBe(true);
    expect(text).toBe("Host keep-me\n    User someone\n");
    expect(text).not.toContain("colabdesk-old");
  });

  it("does not touch another session's block", () => {
    const existing =
      "# >>> ColabDesk managed block: colabdesk-one >>>\nHost colabdesk-one\n" +
      "# <<< ColabDesk managed block: colabdesk-one <<<\n";
    const { text, found } = stripBlock(existing, "colabdesk-two");
    expect(found).toBe(false);
    expect(text).toContain("colabdesk-one");
  });
});
