/**
 * The terminal section: a sandbox at the top, the knobs that drive it below.
 *
 * One section, one column, the width the rest of settings uses — a preview
 * beside its own controls would need a second column no other section has, and
 * the sandbox reads fine stacked. Every control writes the whole record through
 * one action, so what the sandbox shows and what the panes get cannot drift.
 *
 * Themes and fonts carry their own product names and are not translated; the
 * words that describe a position or a shape are.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card, CardHead, Panel, PanelRow } from "../components/ui/Card";
import { Checkbox, Select } from "../components/ui/Field";
import {
  TERMINAL_CURSOR_STYLES,
  TERMINAL_FONTS,
  TERMINAL_FONT_SIZE,
  TERMINAL_LINE_HEIGHTS,
  TERMINAL_PADDINGS,
  TERMINAL_SCROLLBACKS,
  TERMINAL_THEMES,
  terminalThemesOf,
  type TerminalFontId,
  type TerminalThemeId,
} from "../lib/terminal-appearance";
import { TerminalPreview } from "../features/workspace/TerminalPreview";
import { useAppStore } from "../store";

/** A label per value, kept beside the values rather than inside the contract. */
const LINE_HEIGHT_LABELS: Record<number, [string, string]> = {
  1: ["settings.terminalLineHeightCompact", "1.0 紧凑"],
  1.2: ["settings.terminalLineHeightBalanced", "1.2 舒适（推荐）"],
  1.35: ["settings.terminalLineHeightSpacious", "1.35 宽松"],
};

const CURSOR_LABELS: Record<string, [string, string]> = {
  block: ["settings.terminalCursorBlock", "方块"],
  bar: ["settings.terminalCursorBar", "竖线"],
  underline: ["settings.terminalCursorUnderline", "下划线"],
};

const PADDING_LABELS: Record<string, [string, string]> = {
  compact: ["settings.terminalPaddingCompact", "紧凑"],
  normal: ["settings.terminalPaddingNormal", "舒适"],
  spacious: ["settings.terminalPaddingSpacious", "宽松"],
};

/** The palettes are other people's work; the names are theirs too, so they live
    in the contract beside the values rather than in this file. */
function themeLabel(id: TerminalThemeId): string {
  return TERMINAL_THEMES.find((theme) => theme.id === id)?.label ?? id;
}

/**
 * Which of the offered faces this machine does not have. Asked once on mount
 * rather than during render: the answer needs the browser's font registry, which
 * a static render has none of, and it cannot change while settings is open.
 */
function useMissingFonts(): ReadonlySet<string> {
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const absent = TERMINAL_FONTS.filter(
      (font) => !font.bundled && !document.fonts.check(`12px "${font.label}"`),
    ).map((font) => font.id);
    setMissing(new Set(absent));
  }, []);
  return missing;
}

/** A row of choices: the chosen one is the ink button, as everywhere else. */
function Choices<T extends string | number>({
  label,
  description,
  values,
  current,
  text,
  theme,
  disabled,
  chosen,
}: {
  label: string;
  description: string;
  values: readonly T[];
  current: T;
  text: (value: T) => string;
  /** Renders a chip in the value's own palette; only themes have one. */
  theme?: boolean;
  /**
   * For a row that is simply not this row's turn yet. Disabled rather than
   * taken away: "these exist, the switch above is what turns them on" is the
   * fact worth reading, and an absent row says nothing.
   */
  disabled?: boolean;
  chosen: (value: T) => void;
}) {
  return (
    <PanelRow
      label={label}
      description={description}
      actions={
        <div className="row" style={{ gap: "var(--space-1)" }}>
          {values.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === current ? "primary" : "outline"}
              aria-pressed={value === current}
              disabled={disabled}
              onClick={() => chosen(value)}
            >
              {theme ? (
                <span
                  className="terminal-swatch"
                  data-terminal-theme={String(value)}
                  aria-hidden="true"
                />
              ) : null}
              {text(value)}
            </Button>
          ))}
        </div>
      }
    />
  );
}

export function TerminalSettings() {
  const { t } = useTranslation();
  const terminal = useAppStore((state) => state.terminal);
  const setTerminalAppearance = useAppStore((state) => state.setTerminalAppearance);
  const copyOnSelect = useAppStore((state) => state.copyOnSelect);
  const setCopyOnSelect = useAppStore((state) => state.setCopyOnSelect);
  const missingFonts = useMissingFonts();

  const label = (value: number | string, table: Record<string, [string, string]>): string => {
    const [key, fallback] = table[value] ?? ["", String(value)];
    return t(key, fallback);
  };

  return (
    <>
      <Card>
        <CardHead
          title={t("settings.terminalPreviewTitle", "预览")}
          description={t(
            "settings.terminalPreviewDesc",
            "即时预览终端渲染效果，修改将实时应用于所有终端。",
          )}
        />
        <TerminalPreview />
      </Card>

      <Panel title={t("settings.terminalPanelTheme", "配色")}>
        <PanelRow
          label={t("settings.terminalThemeFollowLabel", "跟随界面深浅")}
          description={t(
            "settings.terminalThemeFollowDesc",
            "开启后按界面深浅使用对应配色；关闭后始终使用深色配色。",
          )}
          actions={
            <Checkbox
              checked={terminal.followAppTheme}
              onChange={(event) =>
                setTerminalAppearance({ followAppTheme: event.target.checked })
              }
              label={t("settings.terminalThemeFollowOn", "跟随")}
            />
          }
        />
        <Choices
          label={t("settings.terminalThemeDarkLabel", "深色时用")}
          description={t("settings.terminalThemeDarkDesc", "界面是深色时终端的 ANSI 调色板。")}
          values={terminalThemesOf("dark")}
          current={terminal.themeDark}
          text={(id) => themeLabel(id)}
          theme
          chosen={(themeDark) => setTerminalAppearance({ themeDark })}
        />
        <Choices
          label={t("settings.terminalThemeLightLabel", "浅色时用")}
          description={
            terminal.followAppTheme
              ? t("settings.terminalThemeLightDesc", "界面是浅色时终端的 ANSI 调色板。")
              : t("settings.terminalThemeLightNeedsFollow", "需先开启「跟随界面深浅」。")
          }
          values={terminalThemesOf("light")}
          current={terminal.themeLight}
          text={(id) => themeLabel(id)}
          theme
          disabled={!terminal.followAppTheme}
          chosen={(themeLight) => setTerminalAppearance({ themeLight })}
        />
      </Panel>

      <Panel title={t("settings.terminalPanelType", "排版")}>
        <PanelRow
          label={t("settings.terminalFontLabel", "字体")}
          description={t(
            "settings.terminalFontDesc",
            "未安装的字体将自动回退至内置的 Geist Mono。",
          )}
          actions={
            <Select
              aria-label={t("settings.terminalFontLabel", "字体")}
              value={terminal.fontId}
              onChange={(event) =>
                setTerminalAppearance({ fontId: event.target.value as TerminalFontId })
              }
            >
              {TERMINAL_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                  {missingFonts.has(font.id)
                    ? ` ${t("settings.terminalFontNotInstalled", "（未安装）")}`
                    : ""}
                </option>
              ))}
            </Select>
          }
        />
        <PanelRow
          label={t("settings.terminalFontSizeLabel", "字号")}
          description={t("settings.terminalFontSizeDesc", "调整字体大小（快捷键：Ctrl+Shift+= / -）")}
          actions={
            <div className="row" style={{ gap: "var(--space-1)" }}>
              <Button
                size="sm"
                variant="outline"
                aria-label={t("settings.terminalFontSizeDecrease", "减小字号")}
                disabled={terminal.fontSize <= TERMINAL_FONT_SIZE.min}
                onClick={() =>
                  setTerminalAppearance({ fontSize: terminal.fontSize - TERMINAL_FONT_SIZE.step })
                }
              >
                −
              </Button>
              <span className="mono" data-testid="terminal-font-size">
                {terminal.fontSize} px
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label={t("settings.terminalFontSizeIncrease", "增大字号")}
                disabled={terminal.fontSize >= TERMINAL_FONT_SIZE.max}
                onClick={() =>
                  setTerminalAppearance({ fontSize: terminal.fontSize + TERMINAL_FONT_SIZE.step })
                }
              >
                +
              </Button>
            </div>
          }
        />
        <Choices
          label={t("settings.terminalLineHeightLabel", "行高")}
          description={t("settings.terminalLineHeightDesc", "调整文本行距以优化可读性。")}
          values={TERMINAL_LINE_HEIGHTS}
          current={terminal.lineHeight}
          text={(height) => label(height, LINE_HEIGHT_LABELS)}
          chosen={(lineHeight) => setTerminalAppearance({ lineHeight })}
        />
      </Panel>

      <Panel title={t("settings.terminalPanelViewport", "光标与视口")}>
        <Choices
          label={t("settings.terminalCursorLabel", "光标样式")}
          description={t("settings.terminalCursorDesc", "选择终端光标的显示样式。")}
          values={TERMINAL_CURSOR_STYLES}
          current={terminal.cursorStyle}
          text={(style) => label(style, CURSOR_LABELS)}
          chosen={(cursorStyle) => setTerminalAppearance({ cursorStyle })}
        />
        <PanelRow
          label={t("settings.terminalCursorBlinkLabel", "光标闪烁")}
          description={t("settings.terminalCursorBlinkDesc", "设置终端光标是否闪烁。")}
          actions={
            <Checkbox
              checked={terminal.cursorBlink}
              onChange={(event) => setTerminalAppearance({ cursorBlink: event.target.checked })}
              label={t("settings.terminalCursorBlinkOn", "闪烁")}
            />
          }
        />
        <Choices
          label={t("settings.terminalPaddingLabel", "视口留白")}
          description={t(
            "settings.terminalPaddingDesc",
            "调整终端内容区内边距。",
          )}
          values={TERMINAL_PADDINGS}
          current={terminal.padding}
          text={(level) => label(level, PADDING_LABELS)}
          chosen={(padding) => setTerminalAppearance({ padding })}
        />
        <PanelRow
          label={t("settings.terminalScrollbackLabel", "回滚行数")}
          description={t("settings.terminalScrollbackDesc", "设置缓冲区保留的最大历史行数。")}
          actions={
            <Select
              aria-label={t("settings.terminalScrollbackLabel", "回滚行数")}
              value={terminal.scrollback}
              onChange={(event) =>
                setTerminalAppearance({ scrollback: Number.parseInt(event.target.value, 10) })
              }
            >
              {TERMINAL_SCROLLBACKS.map((lines) => (
                <option key={lines} value={lines}>
                  {lines.toLocaleString()} {t("settings.terminalScrollbackUnit", "行")}
                </option>
              ))}
            </Select>
          }
        />
      </Panel>

      <Panel title={t("settings.terminalPanelClipboard", "复制与粘贴")}>
        <PanelRow
          label={t("settings.terminalCopyOnSelectLabel", "选中即复制")}
          description={t(
            "settings.terminalCopyOnSelectDesc",
            "在终端中选中文本后自动复制到剪贴板；开启后右键直接粘贴。",
          )}
          actions={
            <Checkbox
              checked={copyOnSelect}
              onChange={(event) => setCopyOnSelect(event.target.checked)}
              label={t("settings.terminalCopyOnSelectOn", "自动复制")}
            />
          }
        />
      </Panel>
    </>
  );
}
