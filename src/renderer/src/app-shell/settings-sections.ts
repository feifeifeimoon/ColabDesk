/**
 * The settings section table, kept apart from `SettingsPage.tsx`.
 *
 * That file exports the `SettingsPage` component; a runtime constant in the
 * same module makes React Fast Refresh invalidate the whole module instead of
 * replacing the component. Types would be erased and are fine beside a
 * component — a value is not.
 */

import type { ComponentType } from "react";
import type { SectionId } from "../store/types";
import {
  AccountIcon,
  ChartIcon,
  ContrastIcon,
  KeyboardIcon,
  SyncIcon,
  TerminalIcon,
} from "../components/ui/icons";

export type { SectionId };

interface Section {
  id: SectionId;
  titleKey: string;
  defaultTitle: string;
  descKey: string;
  defaultDesc: string;
  icon: ComponentType<{ size?: number }>;
}

export const GROUPS_DEF: { id: string; titleKey: string; defaultTitle: string; sections: Section[] }[] = [
  {
    id: "interface",
    titleKey: "settings.groupInterface",
    defaultTitle: "界面与交互",
    sections: [
      {
        id: "appearance",
        titleKey: "settings.sectionAppearanceTitle",
        defaultTitle: "外观",
        descKey: "settings.sectionAppearanceDesc",
        defaultDesc: "自定义界面主题、显示语言与缩放。",
        icon: ContrastIcon,
      },
      {
        id: "terminal",
        titleKey: "settings.sectionTerminalTitle",
        defaultTitle: "终端",
        descKey: "settings.sectionTerminalDesc",
        defaultDesc: "终端面板的配色、排版与光标。",
        icon: TerminalIcon,
      },
      {
        id: "shortcuts",
        titleKey: "settings.sectionShortcutsTitle",
        defaultTitle: "快捷键",
        descKey: "settings.sectionShortcutsDesc",
        defaultDesc: "应用内的键盘与鼠标操作，按生效场景分组。",
        icon: KeyboardIcon,
      },
    ],
  },
  {
    id: "colab",
    titleKey: "settings.groupColab",
    defaultTitle: "Colab 引擎",
    sections: [
      {
        id: "account",
        titleKey: "settings.sectionAccountTitle",
        defaultTitle: "账号与环境",
        descKey: "settings.sectionAccountDesc",
        defaultDesc: "Google 账号授权、计算单元余额与本地 Colab CLI 环境。",
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
    id: "app",
    titleKey: "settings.groupApp",
    defaultTitle: "应用",
    sections: [
      {
        id: "about",
        titleKey: "settings.sectionAboutTitle",
        defaultTitle: "关于",
        descKey: "settings.sectionAboutDesc",
        defaultDesc: "应用版本、更新方式与日志位置。",
        icon: SyncIcon,
      },
    ],
  },
];

/**
 * Every section, in nav order, derived from the same table the page renders —
 * so the guard that renders each one in English cannot fall behind the page.
 */
export const SECTION_IDS: readonly SectionId[] = GROUPS_DEF.flatMap((group) =>
  group.sections.map((section) => section.id),
);
