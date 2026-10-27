/**
 * The SSH snippet's body: a connection card, not a dump of raw text.
 *
 * What a person needs, in order: what this is for, whether it can work right
 * now, the one artifact to copy, and the two steps that use it. Everything the
 * app knows but the person does not need — the endpoint, the absolute config
 * path, the launcher — is behind one disclosure at the bottom.
 *
 * The view has no bridge or store, so the hierarchy can be rendered as markup
 * in unit tests.
 */

import { useTranslation } from "react-i18next";
import type { SshSnippet } from "@shared/types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CodeBlock } from "../../components/ui/CodeBlock";
import { CheckIcon, CopyIcon } from "../../components/ui/icons";
import { Callout } from "../../components/ui/Notice";

export type SshCopyTarget = "block" | "config" | "command";

export interface SshSnippetViewProps {
  snippet: SshSnippet;
  /** The machine type, shown beside the sentence that says what this is. */
  accelerator: string | null;
  /** The runtime's endpoint, for the advanced rows. */
  endpoint: string | null;
  /** true: not allocated; false: running; null: the server did not answer. */
  runtimeMissing: boolean | null;
  copied: SshCopyTarget | null;
  generating: boolean;
  onCopy(text: string, target: SshCopyTarget): void;
  onGenerateKey(): void;
}

const CONFIG_LABEL = "~/.ssh/config";

/**
 * A value with its copy action attached: the whole row is the button, so the
 * action is as wide as the thing it copies.
 */
function CopyChip({
  value,
  copied,
  onCopy,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  const action = copied ? t("ssh.copied", "已复制") : t("ssh.copy", "复制");

  return (
    <button
      type="button"
      className="ssh-copy-chip"
      title={value}
      aria-label={`${action}：${value}`}
      onClick={onCopy}
    >
      <code>{value}</code>
      <span className="ssh-copy-chip__action" aria-hidden="true">
        {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
        {action}
      </span>
    </button>
  );
}

export function SshSnippetView({
  snippet,
  accelerator,
  endpoint,
  runtimeMissing,
  copied,
  generating,
  onCopy,
  onGenerateKey,
}: SshSnippetViewProps) {
  const { t } = useTranslation();
  const identityMissing = snippet.identity === null;

  return (
    <>
      <div className="ssh-lead">
        <p className="ssh-lead__text">
          {t("ssh.lead", "用外部终端、VS Code 或 scp 连接这台运行时。")}
        </p>
        {accelerator && <Badge>{accelerator}</Badge>}
      </div>

      {identityMissing && (
        <Callout tone="warn">
          <p>
            {t(
              "ssh.identityMissing",
              "外部 ssh 需要 Colab 支持的密钥（id_ed25519 / id_ecdsa）。先生成密钥，再复制配置。",
            )}
          </p>
          <div className="row">
            <Button size="sm" variant="outline" disabled={generating} onClick={onGenerateKey}>
              {generating ? t("ssh.generatingKey", "生成中…") : t("ssh.generateKey", "生成密钥")}
            </Button>
          </div>
        </Callout>
      )}

      {runtimeMissing === true && (
        <Callout tone="warn">
          <p>
            {t(
              "ssh.runtimeMissing",
              "这个会话当前没有运行中的运行时，外部连接会失败。先在应用里新建或同步会话。",
            )}
          </p>
        </Callout>
      )}

      <CodeBlock
        label={CONFIG_LABEL}
        code={snippet.block}
        action={
          <Button
            variant="primary"
            size="sm"
            disabled={identityMissing}
            onClick={() => onCopy(snippet.block, "block")}
          >
            {copied === "block" ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {copied === "block" ? t("ssh.copied", "已复制") : t("ssh.copyConfig", "复制配置")}
          </Button>
        }
      />

      <section className="ssh-steps">
        <h3 className="ssh-steps__title">{t("ssh.howTo", "使用方法")}</h3>
        <ol className="ssh-steps__list">
          <li>
            <div className="ssh-steps__body">
              <p className="ssh-steps__text">
                {t("ssh.stepPaste", "把配置粘贴到文件最顶部（任何 Host * 之前）。")}
              </p>
              <CopyChip
                value={CONFIG_LABEL}
                copied={copied === "config"}
                onCopy={() => onCopy(CONFIG_LABEL, "config")}
              />
            </div>
          </li>
          <li>
            <div className="ssh-steps__body">
              <p className="ssh-steps__text">{t("ssh.stepRun", "保存后运行：")}</p>
              <CopyChip
                value={snippet.command}
                copied={copied === "command"}
                onCopy={() => onCopy(snippet.command, "command")}
              />
            </div>
          </li>
        </ol>
      </section>

      <ul className="ssh-notes">
        <li>{t("ssh.vscode", "VS Code Remote-SSH 读取同一个文件，连接时选择这个别名即可。")}</li>
        <li>
          {t(
            "ssh.singleConnection",
            "同一个运行时只允许一个 SSH 连接；外部客户端连着时，应用内终端会断开。",
          )}
        </li>
      </ul>

      <details className="ssh-advanced">
        <summary>{t("ssh.advanced", "高级信息")}</summary>
        <dl className="ssh-advanced__list">
          <div className="ssh-advanced__row">
            <dt>{t("ssh.alias", "主机别名")}</dt>
            <dd>
              <code>{snippet.alias}</code>
            </dd>
          </div>
          {snippet.alias_mapped && (
            <div className="ssh-advanced__row">
              <dt>{t("ssh.aliasNote", "别名说明")}</dt>
              <dd>{t("ssh.aliasMapped", "会话名包含特殊字符，别名已规范化。")}</dd>
            </div>
          )}
          {endpoint && (
            <div className="ssh-advanced__row">
              <dt>{t("ssh.endpoint", "运行时端点")}</dt>
              <dd>
                <code>{endpoint}</code>
              </dd>
            </div>
          )}
          {snippet.identity && (
            <div className="ssh-advanced__row">
              <dt>{t("ssh.identity", "身份密钥")}</dt>
              <dd>
                <code>{snippet.identity}</code>
              </dd>
            </div>
          )}
          <div className="ssh-advanced__row">
            <dt>{t("ssh.configPathLocal", "本机路径")}</dt>
            <dd>
              <code>{snippet.config_path}</code>
            </dd>
          </div>
          <div className="ssh-advanced__row">
            <dt>{t("ssh.launcher", "代理启动器")}</dt>
            <dd>
              <code>{snippet.launcher_path}</code>
            </dd>
          </div>
        </dl>
      </details>
    </>
  );
}
