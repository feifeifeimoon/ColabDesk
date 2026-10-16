/**
 * The middle column: one slot per session that has tabs, and the start page
 * while none of them is on screen.
 *
 * The two levels of parking are both load-bearing. A slot that is not the
 * selected session leaves the layout but keeps its tabs: switching sessions
 * must not hang up on the runtime you were working on. Inside a slot, the tabs
 * that are not the shown one park the same way — a terminal is a live SSH
 * session, and a file holds a read of its own, so neither is a thing to throw
 * away because something else came to the front.
 *
 * A tab is a shell or a file, and that is why a file is not a dialog: a log is
 * read *against* the terminal that is producing it.
 */

import { useMemo } from "react";
import { useAppStore } from "../../store";
import { FilePane } from "./FilePane";
import { FileView } from "./FileView";
import { StartPage } from "./StartPage";
import { TerminalPane } from "./TerminalPane";

export function Workbench() {
  const tabs = useAppStore((state) => state.tabs);
  const selectedSession = useAppStore((state) => state.selectedSession);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const filesOpen = useAppStore((state) => state.filesOpen);
  const setTransferCount = useAppStore((state) => state.setTransferCount);

  // Grouped here rather than in a selector: a selector that built this would
  // hand back a new reference on every store write.
  const tabsBySession = useMemo(() => {
    const groups = new Map<string, typeof tabs>();
    for (const tab of tabs) groups.set(tab.session, [...(groups.get(tab.session) ?? []), tab]);
    return groups;
  }, [tabs]);

  const onScreen = selectedSession !== null && tabsBySession.has(selectedSession);

  return (
    <>
      {!onScreen && <StartPage />}

      {[...tabsBySession].map(([session, sessionTabs]) => {
        const shown = session === selectedSession;
        return (
          <div key={session} className="work-slot" hidden={!shown} inert={!shown}>
            <div className="terminal-stack">
              {sessionTabs.map((tab) => {
                const active = shown && tab.id === activeTabId;
                return tab.kind === "shell" ? (
                  <TerminalPane key={tab.id} session={tab.session} active={active} />
                ) : (
                  <FileView
                    key={tab.id}
                    session={tab.session}
                    path={tab.path}
                    name={tab.name}
                    tabId={tab.id}
                    active={active}
                  />
                );
              })}
            </div>
            {/* One browser per session: a runtime has one filesystem, and its
                shells look at the same one. It parks with the panel instead of
                unmounting — folding the tree away costs the shape it was left
                in, and reopening a folder should not be a round trip. */}
            <FilePane
              session={session}
              visible={filesOpen && shown}
              onTransferCount={(active) => setTransferCount(session, active)}
            />
          </div>
        );
      })}
    </>
  );
}
