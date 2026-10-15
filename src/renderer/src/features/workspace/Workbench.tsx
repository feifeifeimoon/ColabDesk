/**
 * The middle column: one slot per session that has shells, and the start page
 * while none of them is on screen.
 *
 * The two levels of parking are both load-bearing. A slot that is not the
 * selected session leaves the layout but keeps its shells: switching sessions
 * must not hang up on the runtime you were working on. Inside a slot, the
 * shells that are not the shown tab park the same way — a terminal is a live
 * SSH session, so the tab you are not looking at is still running.
 */

import { useMemo } from "react";
import { useAppStore } from "../../store";
import { FilePane } from "./FilePane";
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
  const shellsBySession = useMemo(() => {
    const groups = new Map<string, typeof tabs>();
    for (const tab of tabs) groups.set(tab.session, [...(groups.get(tab.session) ?? []), tab]);
    return groups;
  }, [tabs]);

  const onScreen = selectedSession !== null && shellsBySession.has(selectedSession);

  return (
    <>
      {!onScreen && <StartPage />}

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
