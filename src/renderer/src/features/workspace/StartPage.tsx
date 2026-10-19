/**
 * What the middle column shows while no terminal is on screen.
 *
 * There are no pages to navigate to in this app, so the one surface that is ever
 * blank is the one you launch into. It carries the name, the single claim the
 * product makes, the next step, and where the source lives — but the next step
 * is still the point: the line under the hero is the empty state speaking, and a
 * surface that only decorates would be a worse empty state than a plain one.
 *
 * A session that has no shells yet is a different situation — the reader is
 * mid-task and wants a terminal, not a front door — so that state gets the same
 * centred column and nothing else: no brand story, no ask.
 */

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "../../app-shell/BrandLockup";
import { Button } from "../../components/ui/Button";
import { ChartIcon, ChipIcon, FolderIcon, StarIcon, TerminalIcon } from "../../components/ui/icons";
import { openExternal } from "../../lib/api";
import { LoginPanel } from "../login/LoginPanel";
import {
  REPOSITORY,
  REPOSITORY_URL,
  hasOpenedRepository,
  rememberRepositoryOpened,
} from "../../lib/star-prompt";
import { useAppStore } from "../../store";

export function StartPage() {
  const { t } = useTranslation();
  const selectedSession = useAppStore((state) => state.selectedSession);
  const hasSessions = useAppStore((state) => state.sessions.length > 0);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const openTab = useAppStore((state) => state.openTab);
  const openNewSession = useAppStore((state) => state.openNewSession);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment);
  // `false` is "read, and nobody is signed in"; `null` is "not read yet" — the
  // front door must not guess between them, so only a known `false` changes it.
  const authenticated = useAppStore((state) => state.env?.authenticated ?? null);
  const signedOut = authenticated === false;

  if (selectedSession !== null) {
    return (
      <div className="startpage">
        <div className="startpage__column">
          <h2 className="startpage__title">
            {t("workbench.emptyNoShells", "「{{name}}」还没有终端。", { name: selectedSession })}
          </h2>
          <div className="startpage__actions">
            <Button
              variant="primary"
              title={t("home.newTerminalTitle", "新建终端（Ctrl+Shift+T）")}
              onClick={() => openTab(selectedSession)}
            >
              {t("workbench.newTerminal", "新建终端")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="startpage">
      <div className="startpage__column">
        {/* The name is a drawing, so the heading is the drawing: the identity
            kit's wordmark is not type this app may set. */}
        <h1 className="startpage__lockup">
          <BrandLockup />
        </h1>
        <p className="startpage__tagline">
          {t("home.tagline", "Google Colab 运行时的桌面 SSH 控制台")}
        </p>
        <p className="startpage__next">
          {signedOut
            ? t("workbench.signInPrompt", "先登录 Google 账号，才能创建运行时。")
            : hasSessions
              ? t("workbench.emptyChooseSession", "选一个会话，或新建一个运行时。")
              : t("workbench.emptyGetStarted", "新建一个运行时开始使用。")}
        </p>

        <div className="startpage__actions">
          {signedOut ? (
            /* The same panel the settings page mounts, in its signed-out form:
               the front door's one action *is* signing in. One implementation,
               two places it is needed. */
            <LoginPanel onFinished={refreshEnvironment} authenticated={false} />
          ) : (
            <Button
              variant="primary"
              onClick={openNewSession}
              title={t("home.newSessionTitle", "新建会话（Ctrl+Shift+N）")}
            >
              {t("workbench.newSession", "新建会话")}
            </Button>
          )}
          {!sidebarOpen && hasSessions && (
            <Button
              onClick={toggleSidebar}
              title={t("home.expandSidebarTitle", "展开会话栏（Ctrl+Shift+E）")}
            >
              {t("workbench.expandSidebar", "展开会话栏")}
            </Button>
          )}
        </div>

        <ul className="startpage__features">
          <Feature
            icon={<ChipIcon />}
            title={t("home.featureShellsTitle", "申请 GPU 运行时")}
            line={t("home.featureShellsLine", "选择算力规格，直接接入交互式终端。")}
          />
          {/* The terminal, not a play button: nothing here launches a job — the
              shell does, on the machine the first line just handed over. */}
          <Feature
            icon={<TerminalIcon />}
            title={t("home.featureRunTitle", "训练与推理工作流")}
            line={t("home.featureRunLine", "保持原生终端操作习惯，无缝运行脚本。")}
          />
          <Feature
            icon={<FolderIcon />}
            title={t("home.featureFilesTitle", "双向文件传输")}
            line={t("home.featureFilesLine", "基于 SFTP 协议，直接浏览、上传与下载远程文件。")}
          />
          <Feature
            icon={<ChartIcon />}
            title={t("home.featureQuotaTitle", "算力与用量监控")}
            line={t("home.featureQuotaLine", "实时跟踪计算单元（CU）余额与消耗速率。")}
          />
        </ul>

        <footer className="startpage__footer">
          <StarAsk />
        </footer>
      </div>
    </div>
  );
}

function Feature({ icon, title, line }: { icon: ReactNode; title: string; line: string }) {
  return (
    <li className="startpage__feature">
      {icon}
      <span className="startpage__feature-title">{title}</span>
      <span className="startpage__feature-line">{line}</span>
    </li>
  );
}

/** Points at the repository, and stops asking once it has been opened. */
function StarAsk() {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(hasOpenedRepository);

  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="star-on-github"
      className={`startpage__star${opened ? " startpage__star--opened" : ""}`}
      title={
        opened
          ? t("home.repositoryTitle", "打开源码仓库：github.com/{{repository}}", {
              repository: REPOSITORY,
            })
          : t("home.starAskTitle", "喜欢 ColabDesk？在 GitHub 上点个 Star 支持一下。")
      }
      onClick={() => {
        openExternal(REPOSITORY_URL);
        rememberRepositoryOpened();
        setOpened(true);
      }}
    >
      <StarIcon size={14} />
      {opened ? REPOSITORY : t("home.starAsk", "在 GitHub 上点个 Star")}
    </Button>
  );
}
