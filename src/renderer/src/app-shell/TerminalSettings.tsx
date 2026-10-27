/**
 * The terminal section: the palette, the typography controls, the sandbox, then
 * the viewport.
 *
 * One section, one column, the width the rest of settings uses — a preview
 * beside its own controls would need a second column no other section has, and
 * the sandbox reads fine stacked. It sits **between the two panels it serves**:
 * type above, the viewport's padding below. The palette needs no sandbox because
 * every row carries its own strip.
 *
 * Every control writes the whole record through one action. The palette is the
 * exception the sandbox is built for: settings edits one of two slots at a time
 * and hands that slot's palette to the sandbox, so a choice for the mode the app
 * is not in is still visible — the live panes keep the slot they are actually
 * wearing.
 *
 * Themes and fonts carry their own product names and are not translated; the
 * words that describe a position or a shape are.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card, CardHead, Panel, PanelRow } from "../components/ui/Card";
import { Switch, Select } from "../components/ui/Field";
import { CheckIcon } from "../components/ui/icons";
import { SegmentedControl } from "../components/ui/SegmentedControl";
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

/** Which of the two slots the section is showing: what the mode segments pick. */
type ThemeMode = "dark" | "light";

/** The eight channels a theme row shows; the strip is the choice. */
const THEME_DOTS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

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
  chosen,
}: {
  label: string;
  description: string;
  values: readonly T[];
  current: T;
  text: (value: T) => string;
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
              onClick={() => chosen(value)}
            >
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
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  // The set the app is wearing is the one worth opening on; the segments let
  // the other be edited without leaving the section.
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolvedTheme === "light" ? "light" : "dark",
  );
  const missingFonts = useMissingFonts();

  const modeLabel =
    themeMode === "dark"
      ? t("settings.terminalThemeDarkLabel", "深色")
      : t("settings.terminalThemeLightLabel", "浅色");
  const chosenTheme = themeMode === "dark" ? terminal.themeDark : terminal.themeLight;
  const chooseTheme = (id: TerminalThemeId): void =>
    setTerminalAppearance(themeMode === "dark" ? { themeDark: id } : { themeLight: id });

  const label = (value: number | string, table: Record<string, [string, string]>): string => {
    const [key, fallback] = table[value] ?? ["", String(value)];
    return t(key, fallback);
  };

  return (
    <>
      <Panel title={t("settings.terminalPanelTheme", "配色")}>
        <PanelRow
          label={t("settings.terminalThemeModeLabel", "配色模式")}
          description={t(
            "settings.terminalThemeModeDesc",
            "深色与浅色界面各有一套配色，随界面深浅自动切换。",
          )}
          actions={
            <SegmentedControl
              label={t("settings.terminalThemeModeLabel", "配色模式")}
              value={themeMode}
              options={[
                {
                  value: "dark" as const,
                  label: t("settings.terminalThemeDarkLabel", "深色"),
                },
                {
                  value: "light" as const,
                  label: t("settings.terminalThemeLightLabel", "浅色"),
                },
              ]}
              onChange={setThemeMode}
            />
          }
        />
        <div className="theme-list" role="radiogroup" aria-label={modeLabel}>
          {terminalThemesOf(themeMode).map((id) => {
            const selected = id === chosenTheme;
            return (
              <label
                key={id}
                className={`theme-option ${selected ? "theme-option--selected" : ""}`.trim()}
                data-terminal-theme={id}
              >
                <input
                  type="radio"
                  className="visually-hidden"
                  name={`terminal-theme-${themeMode}`}
                  value={id}
                  checked={selected}
                  onChange={() => chooseTheme(id)}
                />
                <span className="theme-option__preview" aria-hidden="true">
                  {THEME_DOTS.map((dot) => (
                    <span key={dot} className={`theme-option__dot theme-option__dot--${dot}`} />
                  ))}
                </span>
                <span className="theme-option__name">{themeLabel(id)}</span>
                <span className="theme-option__mark" aria-hidden="true">
                  {selected ? <CheckIcon size={14} /> : null}
                </span>
              </label>
            );
          })}
        </div>
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

      {/* Between the two panels whose settings it shows: type above, the
          viewport's padding below. The palette previews itself with its strips,
          so it does not need the sandbox at the top of the section. */}
      <Card>
        <CardHead
          title={t("settings.terminalPreviewTitle", "预览")}
          actions={
            <Badge>
              {themeMode === "dark"
                ? t("settings.terminalPreviewDark", "深色配色")
                : t("settings.terminalPreviewLight", "浅色配色")}
            </Badge>
          }
        />
        <TerminalPreview themeId={chosenTheme} />
      </Card>

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
            <Switch
              checked={terminal.cursorBlink}
              onChange={(cursorBlink) => setTerminalAppearance({ cursorBlink })}
              label={t("settings.terminalCursorBlinkLabel", "光标闪烁")}
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
            <Switch
              checked={copyOnSelect}
              onChange={setCopyOnSelect}
              label={t("settings.terminalCopyOnSelectLabel", "选中即复制")}
            />
          }
        />
      </Panel>
    </>
  );
}
