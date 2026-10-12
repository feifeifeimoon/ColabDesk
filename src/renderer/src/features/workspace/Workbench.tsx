/**
 * The middle column: one slot per session that has shells, plus the empty state.
 *
 * The two levels of parking are both load-bearing. A slot that is not the
 * selected session leaves the layout but keeps its shells: switching sessions
 * must not hang up on the runtime you were working on. Inside a slot, the
 * shells that are not the shown tab park the same way — a terminal is a live
 * SSH session, so the tab you are not looking at is still running.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";
import { FilePane } from "./FilePane";
import { TerminalPane } from "./TerminalPane";

export function Workbench() {
  const { t } = useTranslation();
  const tabs = useAppStore((state) => state.tabs);
  const selectedSession = useAppStore((state) => state.selectedSession);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const filesOpen = useAppStore((state) => state.filesOpen);
  const hasSessions = useAppStore((state) => state.sessions.length > 0);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const setRemotePath = useAppStore((state) => state.setRemotePath);
  const setTransferCount = useAppStore((state) => state.setTransferCount);
  const openTab = useAppStore((state) => state.openTab);
  const openNewSession = useAppStore((state) => state.openNewSession);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  // Grouped here rather than in a selector: a selector that built this would
  // hand back a new reference on every store write.
  const shellsBySession = useMemo(() => {
    const groups = new Map<string, typeof tabs>();
    for (const tab of tabs) groups.set(tab.session, [...(groups.get(tab.session) ?? []), tab]);
    return groups;
  }, [tabs]);

  const onScreen = selectedSession !== null && shellsBySession.has(selectedSession);

  return (
    <>
      {!onScreen && (
        <div className="work-empty">
          <h2>{t("workbench.emptyTitle", "没有打开的终端")}</h2>
          <p className="hint">
            {selectedSession
              ? t("workbench.emptyNoShells", "「{{name}}」还没有终端。", { name: selectedSession })
              : hasSessions
                ? t("workbench.emptyChooseSession", "在左侧选择一个会话，或新建一个运行时。")
                : t("workbench.emptyGetStarted", "新建一个运行时开始使用。")}
          </p>
          <div className="row">
            {selectedSession ? (
              <button type="button" className="btn btn--primary" onClick={() => openTab(selectedSession)}>
                {t("workbench.newTerminal", "新建终端")}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={openNewSession}>
                {t("workbench.newSession", "新建会话")}
              </button>
            )}
            {!sidebarOpen && hasSessions && (
              <button type="button" className="btn" onClick={toggleSidebar}>
                {t("workbench.expandSidebar", "展开会话栏")}
              </button>
            )}
          </div>
        </div>
      )}

      {[...shellsBySession].map(([session, shells]) => {
        const shown = session === selectedSession;
        return (
          <div key={session} className="work-slot" hidden={!shown} inert={!shown}>
            <div className="terminal-stack">
              {shells.map((tab) => (
                <TerminalPane
                  key={tab.id}
                  session={tab.session}
                  active={shown && tab.id === activeTabId}
                />
              ))}
            </div>
            {/* One browser per session: a runtime has one filesystem, and its
                shells look at the same one. */}
            {filesOpen && (
              <FilePane
                session={session}
                onPathChange={(path) => setRemotePath(session, path)}
                onTransferCount={(active) => setTransferCount(session, active)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
