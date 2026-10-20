/**
 * The shortcut reference: one table per place a key applies.
 *
 * Nothing here is remappable yet, so this is a reference sheet rather than a
 * settings form. The grouping is the part that carries information: a key that
 * works from inside a terminal and one that only works in the file tree should
 * not read as the same list. Keys are literals (they are the same on every
 * language); only the words around them are translated.
 */

import { useTranslation } from "react-i18next";
import { Panel } from "../components/ui/Card";

interface ShortcutRow {
  /** The key combination, printed as-is. */
  keys?: string;
  /** For a key named by a word rather than a combination ("right-click"). */
  keysKey?: string;
  keysDefault?: string;
  actionKey: string;
  actionDefault: string;
}

interface ShortcutGroup {
  id: string;
  titleKey: string;
  defaultTitle: string;
  rows: ShortcutRow[];
}

const GROUPS: ShortcutGroup[] = [
  {
    id: "global",
    titleKey: "settings.shortcutsGlobalTitle",
    defaultTitle: "全局与窗口",
    rows: [
      {
        keys: "Ctrl/Cmd+,",
        actionKey: "settings.shortcutOpenSettings",
        actionDefault: "打开设置",
      },
      {
        keys: "Ctrl/Cmd+Shift+E",
        actionKey: "settings.shortcutToggleSidebar",
        actionDefault: "显示 / 隐藏会话栏",
      },
      {
        keys: "Ctrl/Cmd+Shift+B",
        actionKey: "settings.shortcutToggleFiles",
        actionDefault: "显示 / 隐藏文件面板",
      },
      {
        keys: "Esc",
        actionKey: "settings.shortcutCloseSettings",
        actionDefault: "关闭设置，返回工作台",
      },
    ],
  },
  {
    id: "sessions",
    titleKey: "settings.shortcutsSessionsTitle",
    defaultTitle: "会话与标签",
    rows: [
      {
        keys: "Ctrl/Cmd+Shift+N",
        actionKey: "settings.shortcutNewSession",
        actionDefault: "新建会话",
      },
      {
        keys: "Ctrl/Cmd+Shift+T",
        actionKey: "settings.shortcutNewTerminal",
        actionDefault: "新建终端",
      },
      {
        keys: "Ctrl/Cmd+Shift+W",
        actionKey: "settings.shortcutCloseTab",
        actionDefault: "关闭当前标签",
      },
      {
        keys: "Ctrl/Cmd+Shift+1…9",
        actionKey: "settings.shortcutSwitchTab",
        actionDefault: "切换标签",
      },
    ],
  },
  {
    id: "terminal",
    titleKey: "settings.shortcutsTerminalTitle",
    defaultTitle: "终端面板内",
    rows: [
      {
        keys: "Ctrl+Shift+C / Cmd+C",
        actionKey: "settings.shortcutCopy",
        actionDefault: "复制选中内容",
      },
      {
        keys: "Ctrl+Shift+V / Cmd+V",
        actionKey: "settings.shortcutPaste",
        actionDefault: "粘贴",
      },
      {
        keysKey: "settings.shortcutRightClickKey",
        keysDefault: "右键",
        actionKey: "settings.shortcutRightClick",
        actionDefault: "有选中就复制，否则粘贴",
      },
      {
        keys: "Ctrl/Cmd+Shift+= / -",
        actionKey: "settings.shortcutFontSize",
        actionDefault: "终端字号增大 / 减小",
      },
      {
        keys: "Ctrl/Cmd+Shift+F",
        actionKey: "settings.shortcutTerminalSearch",
        actionDefault: "在终端中查找",
      },
    ],
  },
  {
    id: "files",
    titleKey: "settings.shortcutsFilesTitle",
    defaultTitle: "文件树",
    rows: [
      {
        keys: "↑ / ↓",
        actionKey: "settings.shortcutFileMove",
        actionDefault: "上下移动焦点",
      },
      {
        keys: "→",
        actionKey: "settings.shortcutFileExpand",
        actionDefault: "展开文件夹；已展开时进入第一项",
      },
      {
        keys: "←",
        actionKey: "settings.shortcutFileCollapse",
        actionDefault: "折叠文件夹；已折叠时回到上一级",
      },
      {
        keys: "Home / End",
        actionKey: "settings.shortcutFileJump",
        actionDefault: "跳到第一项 / 最后一项",
      },
      {
        keys: "Enter",
        actionKey: "settings.shortcutFileOpen",
        actionDefault: "打开文件或展开文件夹",
      },
    ],
  },
];

export function ShortcutsSettings() {
  const { t } = useTranslation();

  return (
    <>
      {GROUPS.map((group) => (
        <Panel key={group.id} title={t(group.titleKey, group.defaultTitle)}>
          <table className="table">
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.actionKey}>
                  <td style={{ width: 260 }}>
                    <span className="kbd">
                      {row.keysKey ? t(row.keysKey, row.keysDefault ?? "") : row.keys}
                    </span>
                  </td>
                  <td>{t(row.actionKey, row.actionDefault)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
    </>
  );
}
