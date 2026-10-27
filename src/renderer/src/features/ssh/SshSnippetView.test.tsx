/**
 * The SSH card's visible rules, without a DOM or a bridge.
 *
 * The hierarchy is the point: what this is for, whether it can work, the block
 * to copy, the two steps that use it, and the app's own details folded away.
 * A missing key stops the copy; an unallocated runtime is said out loud.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { SshSnippet } from "@shared/types";
import { setRendererUiLanguage } from "../../i18n/i18n";
import { SshSnippetView, type SshCopyTarget } from "./SshSnippetView";

const snippet: SshSnippet = {
  session: "alpha",
  alias: "colabdesk-alpha",
  command: "ssh colabdesk-alpha",
  block:
    "# ColabDesk: alpha\n" +
    "Host colabdesk-alpha\n" +
    "    HostName colab-runtime\n" +
    "    User root\n" +
    '    ProxyCommand "C:/Users/dev/.colabdesk/bin/colabdesk-proxy.cmd" ssh --proxy-mode -s "alpha"\n',
  config_path: "C:\\Users\\dev\\.ssh\\config",
  identity: "C:\\Users\\dev\\.ssh\\id_ed25519",
  launcher_path: "C:\\Users\\dev\\.colabdesk\\bin\\colabdesk-proxy.cmd",
  alias_mapped: false,
};

const noop = () => {};

function render(
  overrides: Partial<SshSnippet> = {},
  runtimeMissing: boolean | null = false,
  copied: SshCopyTarget | null = null,
): string {
  return renderToStaticMarkup(
    createElement(SshSnippetView, {
      snippet: { ...snippet, ...overrides },
      accelerator: "T4",
      endpoint: "alpha.e2e.invalid",
      runtimeMissing,
      copied,
      generating: false,
      onCopy: noop,
      onGenerateKey: noop,
    }),
  );
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

beforeEach(async () => {
  await setRendererUiLanguage("zh");
});

describe("the SSH snippet view", () => {
  it("leads with what it is for, then the block and the two steps", () => {
    const html = render();
    const copy = text(html);

    expect(copy).toContain("用外部终端、VS Code 或 scp");
    expect(copy).toContain("T4");

    expect(html).toContain('class="code-block__body"');
    expect(html).toContain("Host colabdesk-alpha");
    expect(copy).toContain("~/.ssh/config");
    expect(copy).toContain("使用方法");
    expect(copy).toContain("把配置粘贴到文件最顶部");
    expect(copy).toContain("ssh colabdesk-alpha");
    expect(copy).toContain("高级信息");
    expect(copy).toContain("只允许一个 SSH 连接");

    // A healthy connection says nothing about keys or allocation: those are
    // implementation facts, not decisions the person has to make.
    expect(copy).not.toContain("密钥 id_ed25519");
    expect(copy).not.toContain("运行时运行中");
    expect(copy).not.toContain("外部连接会失败");
  });

  it("stops the copy when no usable key exists, and says how to make one", () => {
    const html = render({ identity: null });

    expect(text(html)).toContain("外部 ssh 需要 Colab 支持的密钥");
    expect(text(html)).toContain("生成密钥");
    expect(html).toContain("disabled");
    // The block still shows its shape; it is the action that is gated.
    expect(html).toContain("Host colabdesk-alpha");
  });

  it("keeps the alias and identity explanation in the advanced rows", () => {
    const html = render({ alias_mapped: true });

    expect(text(html)).toContain("主机别名");
    expect(text(html)).toContain("会话名包含特殊字符");
    expect(text(html)).toContain("alpha.e2e.invalid");
    expect(text(html)).toContain("C:\\Users\\dev\\.ssh\\id_ed25519");
  });

  it("warns only when the session has no running runtime", () => {
    const gone = text(render({}, true));
    expect(gone).toContain("没有运行中的运行时");
    expect(gone).toContain("外部连接会失败");

    expect(text(render({}, false))).not.toContain("外部连接会失败");
    expect(text(render({}, null))).not.toContain("外部连接会失败");
  });

  it("confirms the exact action that was copied, not the whole card", () => {
    const blockHtml = render({}, false, "block");
    expect(text(blockHtml)).toContain("已复制");
    expect(blockHtml).toContain("复制：~/.ssh/config");
    expect(blockHtml).not.toContain("已复制：~/.ssh/config");

    const configHtml = render({}, false, "config");
    expect(configHtml).toContain("已复制：~/.ssh/config");
    expect(text(configHtml)).toContain("已复制");
  });
});
