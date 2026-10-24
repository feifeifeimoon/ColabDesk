/**
 * The middle column: one slot per session that has tabs, and the start page
 * while none of them is on screen.
 *
 * A session is a split tree of panes; a pane is a tab group with its own strip.
 * Tabs that are not their group's active one stay mounted, and so do the groups
 * of sessions that are not selected: a terminal is a live SSH session, and a
 * file holds a read of its own, so neither is a thing to throw away because
 * something else came to the front.
 *
 * A tab is a shell or a file, and that is why a file is not a dialog: a log is
 * read *against* the terminal that is producing it.
 */

import { useMemo } from "react";
import { useAppStore } from "../../store";
import { FilePane } from "./FilePane";
import { PaneSurface } from "./PaneSurface";
import { RuntimeSetup } from "../sessions/RuntimeSetup";
import { StartPage } from "./StartPage";
import { TabDragProvider } from "./tab-drag/TabDragProvider";

export function Workbench() {
  const tabs = useAppStore((state) => state.tabs);
  const groups = useAppStore((state) => state.groups);
  const groupLayouts = useAppStore((state) => state.groupLayouts);
  const focusedGroupBySession = useAppStore((state) => state.focusedGroupBySession);
  const selectedSession = useAppStore((state) => state.selectedSession);
  const filesOpen = useAppStore((state) => state.filesOpen);
  const setTransferCount = useAppStore((state) => state.setTransferCount);
  const setupOpen = useAppStore((state) => state.creation.open);

  // Grouped here rather than in a selector: a selector that built this would
  // hand back a new reference on every store write.
  const tabsBySession = useMemo(() => {
    const grouped = new Map<string, typeof tabs>();
    for (const tab of tabs) grouped.set(tab.session, [...(grouped.get(tab.session) ?? []), tab]);
    return grouped;
  }, [tabs]);

  const onScreen = selectedSession !== null && tabsBySession.has(selectedSession);

  return (
    <TabDragProvider>
      {!onScreen && !setupOpen && <StartPage />}

      {[...tabsBySession].map(([session, sessionTabs]) => {
        const shown = session === selectedSession;
        const layout = groupLayouts[session];
        return (
          <div key={session} className="work-slot" hidden={!shown} inert={!shown || setupOpen}>
            {layout ? (
              <PaneSurface
                session={session}
                tabs={sessionTabs}
                groups={groups}
                layout={layout}
                focusedGroupId={focusedGroupBySession[session]}
                shown={shown}
              />
            ) : null}
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

      {/* The setup console covers this column rather than replacing it: the
          terminals under it are live SSH sessions. */}
      {setupOpen && <RuntimeSetup />}
    </TabDragProvider>
  );
}
