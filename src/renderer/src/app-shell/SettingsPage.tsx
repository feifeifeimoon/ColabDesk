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
        defaultDesc: "授权状态、计算单元余额与消耗速率，全部来自 colab CLI 的原始回答。",
        icon: AccountIcon,
      },
      {
        id: "usage",
        titleKey: "settings.sectionUsageTitle",
        defaultTitle: "用量趋势",
        descKey: "settings.sectionUsageDesc",
        defaultDesc: "余额读数记下的历史。额度按批结算，所以曲线是按相邻读数摊出来的。",
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
        defaultDesc: "跟随系统，或选择界面语言与浅色 / 深色主题；顶栏右上角的按钮切换的是同一件事。",
        icon: ContrastIcon,
      },
      {
        id: "terminal",
        titleKey: "settings.sectionTerminalTitle",
        defaultTitle: "终端",
        descKey: "settings.sectionTerminalDesc",
        defaultDesc: "终端面板的字号，以及面板内生效的键盘与鼠标操作。",
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
        defaultDesc: "这台机器上的 colab CLI 从哪来、授权到什么时候——出问题时要看的事实。",
        icon: ChipIcon,
      },
      {
        id: "external",
        titleKey: "settings.sectionExternalTitle",
        defaultTitle: "外部工具",
        descKey: "settings.sectionExternalDesc",
        defaultDesc: "把运行时的 SSH 条目写进 ~/.ssh/config，供外部 ssh、scp 与编辑器使用。",
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
            description={t("settings.accountEmailDesc", "取自访问令牌（tokeninfo），不是 CLI 写在磁盘上的字段——那个字段永远是空的。")}
            value={env?.account?.email ?? "—"}
            title={env?.account?.subject ?? undefined}
          />
          <PanelRow
            label={t("settings.accountAccelerators", "可用加速器")}
            description={t("settings.accountAcceleratorsDesc", "这个账号当前有权申请的机型；灰掉的项当前不可用，申请必然失败。")}
            value={eligibilityValue()}
          />
        </Panel>
        <Callout>
          <p>
            {t(
              "settings.disclaimer",
              "ColabDesk 是非官方客户端，与 Google 无关联。所有网络与授权由官方 colab CLI 完成，应用只负责调用与呈现；每一次调用的原始输出都随结果保留。",
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
          description={t("settings.appearanceThemeDesc", "跟随系统时，系统切换深浅色这里会立刻跟上；选了浅色或深色就一直是它。")}
          actions={
            <div className="row" style={{ gap: "var(--space-1)" }}>
              {themes.map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={value === theme ? "primary" : "outline"}
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
        <PanelRow
          label={t("settings.runtimeCliCmd", "colab 命令")}
          description={t("settings.runtimeCliCmdDesc", "应用优先使用内置运行时，其次才是系统安装的 CLI")}
          value={env?.cli_path ?? t("settings.runtimeNotFound", "未找到")}
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
            label={t("settings.externalSshLabel", "当前会话的 SSH 条目")}
            description={
              activeSession
                ? t("settings.externalSshDescActive", "为 {{session}} 写入受管标记块，供外部 ssh / scp / VS Code Remote-SSH 使用", {
                    session: activeSession,
                  })
                : t("settings.externalSshDescInactive", "先打开一个会话，再写入它的 SSH 条目")
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
