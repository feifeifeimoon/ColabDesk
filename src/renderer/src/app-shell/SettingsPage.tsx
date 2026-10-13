/**
 * Settings as a page: a rail of sections on the left, one section on the right.
 * It is deliberately not a dialog — nothing here is a detour you dismiss, and
 * the workbench underneath stays mounted (the terminals are live SSH sessions,
 * so a settings view that replaced them would drop the user's shells).
 *
 * The rail reuses the app sidebar's shape — same width, same tokens, same
 * full-width rows — so entering settings reads as the rail changing what it
 * lists, not as a new window appearing.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SshSetup } from "@shared/types";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, Panel, PanelRow } from "../components/ui/Card";
import { PanelDivider } from "../components/ui/PanelDivider";
import { PANEL_WIDTH } from "../lib/panel-width";
import {
  AccountIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChipIcon,
  ContrastIcon,
  PlugIcon,
  TerminalIcon,
} from "../components/ui/icons";
import { Callout } from "../components/ui/Notice";
import { RawOutput } from "../components/ui/RawOutput";
import { LoginPanel } from "../features/login/LoginPanel";
import { UsageTrendPanel } from "../features/usage/UsageTrendPanel";
import { TerminalSettings } from "./TerminalSettings";
import { UI_LANGUAGE_CHOICES } from "../i18n/supported-languages";
import { messageOf, sshRemove, sshSetup } from "../lib/api";
import { formatExpiry } from "../lib/format";
import type { ThemePreference } from "../lib/theme";
import { useAppStore } from "../store";

/** Font sizes the terminal accepts; the choice survives restarts. */
export type SectionId = "account" | "usage" | "appearance" | "terminal" | "runtime" | "external";

interface Section {
  id: SectionId;
  titleKey: string;
  defaultTitle: string;
  descKey: string;
  defaultDesc: string;
  icon: (props: { size?: number }) => React.JSX.Element;
}

const GROUPS_DEF: { id: string; titleKey: string; defaultTitle: string; sections: Section[] }[] = [
  {
    id: "account",
    titleKey: "settings.groupAccount",
    defaultTitle: "账号",
    sections: [
      {
        id: "account",
        titleKey: "settings.sectionAccountTitle",
        defaultTitle: "账号与额度",
        descKey: "settings.sectionAccountDesc",
        defaultDesc: "查看 Google 账号授权状态、计算单元余额及消耗速率。",
        icon: AccountIcon,
      },
      {
        id: "usage",
        titleKey: "settings.sectionUsageTitle",
        defaultTitle: "用量趋势",
        descKey: "settings.sectionUsageDesc",
        defaultDesc: "基于历史余额采样推算用量走势。",
        icon: ChartIcon,
      },
    ],
  },
  {
    id: "workbench",
    titleKey: "settings.groupWorkbench",
    defaultTitle: "工作台",
    sections: [
      {
        id: "appearance",
        titleKey: "settings.sectionAppearanceTitle",
        defaultTitle: "外观",
        descKey: "settings.sectionAppearanceDesc",
        defaultDesc: "自定义界面主题与显示语言。",
        icon: ContrastIcon,
      },
      {
        id: "terminal",
        titleKey: "settings.sectionTerminalTitle",
        defaultTitle: "终端",
        descKey: "settings.sectionTerminalDesc",
        defaultDesc: "终端面板的配色、排版、光标及快捷键操作。",
        icon: TerminalIcon,
      },
    ],
  },
  {
    id: "runtime",
    titleKey: "settings.groupRuntime",
    defaultTitle: "运行时",
    sections: [
      {
        id: "runtime",
        titleKey: "settings.sectionRuntimeTitle",
        defaultTitle: "运行环境",
        descKey: "settings.sectionRuntimeDesc",
        defaultDesc: "查看本地 Colab CLI 环境、安装来源及授权状态。",
        icon: ChipIcon,
      },
      {
        id: "external",
        titleKey: "settings.sectionExternalTitle",
        defaultTitle: "外部工具",
        descKey: "settings.sectionExternalDesc",
        defaultDesc: "配置本地 ~/.ssh/config，支持通过外部终端或 VS Code 远程连接。",
        icon: PlugIcon,
      },
    ],
  },
];

export function SettingsPage({ initialSection = "account" }: { initialSection?: SectionId }) {
  const { t } = useTranslation();
  const open = useAppStore((state) => state.settingsOpen);
  const closeSettings = useAppStore((state) => state.closeSettings);
  const env = useAppStore((state) => state.env);
  const usage = useAppStore((state) => state.usage);
  const activeSession = useAppStore((state) => state.selectedSession);
  const theme = useAppStore((state) => state.theme);
  const language = useAppStore((state) => state.language);
  const width = useAppStore((state) => state.panelWidths.sidebar);
  const setTheme = useAppStore((state) => state.setTheme);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const setPanelWidth = useAppStore((state) => state.setPanelWidth);
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment);

  const [sectionId, setSectionId] = useState<SectionId>(initialSection);
  const [setup, setSetup] = useState<SshSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // This page lies over panes that are still live — a focused terminal would
  // keep the keyboard and eat what the user types at settings, so take focus
  // here and hand it back to whoever had it on the way out.
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    paneRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!open || !nav) return;
    const publish = (): void => {
      const { width: navWidth } = nav.getBoundingClientRect();
      document.documentElement.style.setProperty("--rail-width", `${navWidth}px`);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    publish();
    return () => {
      observer.disconnect();
      const sidebarRail = document.querySelector(".sidebar");
      if (sidebarRail && useAppStore.getState().sidebarOpen) {
        const { width: sidebarWidth } = sidebarRail.getBoundingClientRect();
        document.documentElement.style.setProperty("--rail-width", `${sidebarWidth}px`);
      } else {
        document.documentElement.style.removeProperty("--rail-width");
      }
    };
  }, [open]);

  const sections = GROUPS_DEF.flatMap((group) => group.sections);
  const section = sections.find((candidate) => candidate.id === sectionId) ?? sections[0];
  const Icon = section.icon;

  async function writeConfig() {
    if (!activeSession) return;
    setPending(true);
    try {
      setSetup(await sshSetup(activeSession));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(false);
    }
  }

  async function removeConfig() {
    if (!activeSession) return;
    setPending(true);
    try {
      setSetup(await sshRemove(activeSession));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(false);
    }
  }

  const themes: [ThemePreference, string][] = [
    ["system", t("settings.themeSystem", "跟随系统")],
    ["light", t("settings.themeLight", "浅色")],
    ["dark", t("settings.themeDark", "深色")],
  ];

  const sourceLabels: Record<string, string> = {
    bundled: t("settings.runtimeSourceBundled", "应用内置运行时"),
    override: t("settings.runtimeSourceOverride", "环境变量指定"),
    path: t("settings.runtimeSourcePath", "系统 PATH"),
    "local-bin": t("settings.runtimeSourceLocalBin", "用户目录（uv tool）"),
  };

  /**
   * The accelerator row: what may be allocated, and — just as useful — what may
   * not. The unavailable ones stay visible instead of disappearing, because
   * "H100 is not available to this account" is the answer people come here for.
   */
  function eligibilityValue() {
    const eligibility = env?.accelerator_eligibility;
    if (!eligibility) return "—";
    const entries: [string, boolean][] = [
      ...eligibility.gpus.map((name) => [name, true] as [string, boolean]),
      ...eligibility.ineligible_gpus.map((name) => [name, false] as [string, boolean]),
      ...eligibility.tpus.map((name) => [`TPU ${name}`, true] as [string, boolean]),
      ...eligibility.ineligible_tpus.map((name) => [`TPU ${name}`, false] as [string, boolean]),
    ];
    return (
      <span className="row" style={{ gap: "var(--space-1)", flexWrap: "wrap" }}>
        {entries.map(([name, available]) => (
          <span key={name} title={available ? undefined : t("settings.accountAcceleratorUnavailable", "当前账号不可用")}>
            <Badge tone={available ? "neutral" : "off"}>{name}</Badge>
          </span>
        ))}
      </span>
    );
  }

  function accountBody() {
    const balance = usage?.usage.balance ?? null;
    return (
      <div className="settings__block">
        <Card>
          <div className="metrics">
            <div className="metric">
              <span className="metric__value">{balance === null ? "—" : balance.toFixed(2)}</span>
              <span className="metric__label">{t("settings.metricBalance", "计算单元余额")}</span>
            </div>
            <div className="metric">
              <span className="metric__value">
                {usage?.usage.rate === null || usage?.usage.rate === undefined
                  ? "—"
                  : usage.usage.rate.toFixed(2)}
              </span>
              <span className="metric__label">{t("settings.metricRate", "消耗速率 / 小时")}</span>
            </div>
            <div className="metric">
              <span className="metric__value">
                {usage?.usage.assignments === null || usage?.usage.assignments === undefined
                  ? "—"
                  : usage.usage.assignments}
              </span>
              <span className="metric__label">{t("settings.metricActiveRuntimes", "活跃运行时")}</span>
            </div>
          </div>
          <LoginPanel onFinished={refreshEnvironment} authenticated={env?.authenticated ?? false} />
          <RawOutput text={usage?.raw ?? ""} label={t("settings.rawUsageLabel", "colab usage 原始输出")} />
        </Card>
        {/* Which Google account, and what Colab allows it — answered by the API
            rather than by the CLI, which knows the email but never prints it
            anywhere a machine can read. */}
        <Panel>
          <PanelRow
            label={t("settings.accountEmail", "当前账号")}
            description={t("settings.accountEmailDesc", "当前登录的 Google 账号。")}
            value={env?.account?.email ?? "—"}
            title={env?.account?.subject ?? undefined}
          />
          <PanelRow
            label={t("settings.accountAccelerators", "可用加速器")}
            description={t("settings.accountAcceleratorsDesc", "当前账号有权限申请的硬件加速规格。")}
            value={eligibilityValue()}
          />
        </Panel>
        <Callout>
          <p>
            {t(
              "settings.disclaimer",
              "ColabDesk 是第三方开源客户端，与 Google 无官方关联。所有网络通信与身份凭据均由官方 Colab CLI 处理。",
            )}
          </p>
        </Callout>
      </div>
    );
  }

  function appearanceBody() {
    return (
      <Panel>
        <PanelRow
          label={t("settings.appearanceLanguageLabel", "界面语言")}
          description={t("settings.appearanceLanguageDesc", "界面显示的语言，支持跟随系统、中文与英文。")}
          actions={
            <div className="row" style={{ gap: "var(--space-1)" }}>
              {UI_LANGUAGE_CHOICES.map((choice) => (
                <Button
                  key={choice.value}
                  size="sm"
                  variant={choice.value === language ? "primary" : "outline"}
                  onClick={() => setLanguage(choice.value)}
                >
                  {t(choice.labelKey, choice.fallback)}
                </Button>
              ))}
            </div>
          }
        />
        <PanelRow
          label={t("settings.appearanceThemeLabel", "主题")}
          description={t("settings.appearanceThemeDesc", "选择界面颜色模式，支持浅色、深色或跟随系统。")}
          actions={
            <div className="row" style={{ gap: "var(--space-1)" }}>
              {themes.map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={value === theme ? "primary" : "outline"}
                  data-testid={`theme-choice-${value}`}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          }
        />
      </Panel>
    );
  }

  function runtimeBody() {
    return (
      <Panel>
        <PanelRow label={t("settings.runtimeAppVersion", "应用版本")} value={env?.app_version || "—"} />
        <PanelRow
          label={t("settings.runtimeCliCmd", "colab 命令")}
          description={t("settings.runtimeCliCmdDesc", "本地调用的 Colab CLI 路径。")}
          value={
            env === null
              ? t("settings.runtimeDetecting", "检测中…")
              : (env.cli_path ?? t("settings.runtimeNotFound", "未找到"))
          }
          title={env?.cli_path ?? undefined}
        />
        <PanelRow
          label={t("settings.runtimeSource", "来源")}
          value={env?.cli_source ? (sourceLabels[env.cli_source] ?? env.cli_source) : "—"}
        />
        <PanelRow label={t("settings.runtimeCliVersion", "CLI 版本")} value={env?.cli_version ?? "—"} />
        <PanelRow
          label={t("settings.runtimeConfigDir", "配置目录")}
          value={env?.config_dir ?? "—"}
          title={env?.config_dir ?? undefined}
        />
        <PanelRow
          label={t("settings.runtimeAuth", "授权")}
          description={env?.has_refresh_token ? t("settings.runtimeAuthDesc", "令牌过期后会自动刷新") : undefined}
          value={env?.authenticated ? t("settings.runtimeAuthorized", "已授权") : t("settings.runtimeUnauthorized", "未授权")}
        />
        <PanelRow
          label={t("settings.runtimeTokenExpiry", "令牌到期")}
          value={formatExpiry(env?.token_expiry ?? null)}
          title={env?.token_expiry ?? undefined}
        />
      </Panel>
    );
  }

  function externalBody() {
    return (
      <div className="settings__block">
        <Panel>
          <PanelRow
            label={t("settings.externalSshLabel", "SSH 主机配置")}
            description={
              activeSession
                ? t("settings.externalSshDescActive", "为当前会话「{{session}}」生成并写入 SSH 别名配置，供外部终端或 VS Code 使用", {
                    session: activeSession,
                  })
                : t("settings.externalSshDescInactive", "请先选择或连接一个会话，再写入对应的 SSH 配置")
            }
            actions={
              <div className="row">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!activeSession || pending}
                  onClick={() => void writeConfig()}
                >
                  {t("settings.externalWrite", "写入")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!activeSession || pending}
                  onClick={() => void removeConfig()}
                >
                  {t("settings.externalRemove", "移除")}
                </Button>
              </div>
            }
          />
        </Panel>
        {error && <Callout tone="danger">{error}</Callout>}
        {setup && (
          <Callout>
            <p>{setup.block ? t("settings.externalWritten", "已写入 SSH 配置。") : t("settings.externalRemoved", "已移除 SSH 配置。")}</p>
            <p className="hint">
              {t("settings.externalAliasHint", "别名 {{alias}} · {{path}}", {
                alias: setup.alias,
                path: setup.config_path,
              })}
            </p>
            <RawOutput text={setup.block} label={t("settings.externalRawOutputLabel", "写入的配置块")} />
          </Callout>
        )}
      </div>
    );
  }

  function body() {
    switch (section.id) {
      case "usage":
        return <UsageTrendPanel />;
      case "appearance":
        return appearanceBody();
      case "terminal":
        return <TerminalSettings />;
      case "runtime":
        return runtimeBody();
      case "external":
        return externalBody();
      default:
        return accountBody();
    }
  }

  // Closing covers the page rather than unloading it: the terminals underneath
  // are live SSH sessions. Its sections still unmount, so whatever they read is
  // read again the next time it is opened.
  if (!open) return null;

  return (
    <div className="settings" data-testid="settings-page">
      <nav
        className="settings__nav"
        ref={navRef}
        aria-label={t("settings.navAriaLabel", "设置分类")}
        style={{ width, minWidth: PANEL_WIDTH.sidebar.min }}
      >
        <PanelDivider
          side="sidebar"
          edge="right"
          testId="divider-settings"
          label={t("settings.widthLabel", "设置栏宽度")}
          width={width}
          onCommit={(next) => setPanelWidth("sidebar", next)}
        />
        <div className="settings__nav-head">
          <Button
            variant="ghost"
            size="sm"
            className="settings__back"
            data-testid="close-settings"
            title={t("settings.backToWorkbenchTitle", "返回工作台（Esc）")}
            onClick={closeSettings}
          >
            <ChevronLeftIcon />
            {t("settings.backToWorkbench", "返回工作台")}
          </Button>
        </div>

        <div className="settings__nav-list">
          {GROUPS_DEF.map((group) => (
            <div className="settings__group" key={group.id}>
              <p className="settings__group-title">{t(group.titleKey, group.defaultTitle)}</p>
              {group.sections.map(({ id, titleKey, defaultTitle, icon: SectionIcon }) => (
                <button
                  key={id}
                  type="button"
                  className={`settings__nav-item ${id === section.id ? "settings__nav-item--active" : ""}`.trim()}
                  aria-current={id === section.id ? "page" : undefined}
                  onClick={() => setSectionId(id)}
                >
                  <SectionIcon />
                  <span className="truncate">{t(titleKey, defaultTitle)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="settings__pane" ref={paneRef} tabIndex={-1}>
        <div className="settings__scroll">
          {/* One section at a time: the rail says what else is here, the pane
              never makes you scroll past what you did not ask for. */}
          <section className="settings__section" key={section.id}>
            <header className="settings__head">
              <h1 className="settings__title">
                <Icon />
                {t(section.titleKey, section.defaultTitle)}
              </h1>
              <p className="settings__desc">{t(section.descKey, section.defaultDesc)}</p>
            </header>
            {body()}
          </section>
        </div>
      </div>
    </div>
  );
}
