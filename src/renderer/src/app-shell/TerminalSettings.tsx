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
  TERMINAL_THEME_IDS,
  type TerminalFontId,
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

/** The palettes are other people's work; the names are theirs too. */
const THEME_LABELS: Record<string, string> = {
  titanium: "Titanium",
  "tokyo-night": "Tokyo Night",
  catppuccin: "Catppuccin Mocha",
  "one-dark": "One Dark",
  dracula: "Dracula",
  nord: "Nord",
  monokai: "Monokai",
};

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
  chosen,
}: {
  label: string;
  description: string;
  values: readonly T[];
  current: T;
  text: (value: T) => string;
  /** Renders a chip in the value's own palette; only themes have one. */
  theme?: boolean;
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
  const missingFonts = useMissingFonts();

  const terminalKeys: [string, string][] = [
    ["Ctrl+Shift+C / Cmd+C", t("settings.shortcutCopy", "复制选中内容")],
    ["Ctrl+Shift+V / Cmd+V", t("settings.shortcutPaste", "粘贴")],
    ["右键", t("settings.shortcutRightClick", "有选中就复制，否则粘贴")],
    ["Ctrl+Shift+= / -", t("settings.shortcutFontSize", "终端字号增大 / 减小")],
    ["Ctrl+Shift+T", t("settings.shortcutNewTerminal", "新建终端")],
    ["Ctrl+Shift+N", t("settings.shortcutNewSession", "新建会话")],
    ["Ctrl+Shift+W", t("settings.shortcutCloseTab", "关闭当前标签")],
    ["Ctrl+Shift+1…9", t("settings.shortcutSwitchTab", "切换标签")],
    ["Ctrl+Shift+E", t("settings.shortcutToggleSidebar", "显示 / 隐藏会话栏")],
    ["Ctrl+Shift+B", t("settings.shortcutToggleFiles", "显示 / 隐藏文件面板")],
    ["Ctrl+,", t("settings.shortcutOpenSettings", "设置（Esc 返回工作台）")],
  ];

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
            "这里看到的字体、颜色与留白会同步应用到工作台里所有已打开的终端——不会重连，也不会打断正在跑的命令。",
          )}
        />
        <TerminalPreview />
      </Card>

      <Panel title={t("settings.terminalPanelTheme", "配色")}>
        <Choices
          label={t("settings.terminalThemeLabel", "配色方案")}
          description={t(
            "settings.terminalThemeDesc",
            "终端自带一整套 16 色 ANSI 调色板，远端程序（ls、git、htop）的着色由它决定。",
          )}
          values={TERMINAL_THEME_IDS}
          current={terminal.themeId}
          text={(id) => THEME_LABELS[id] ?? id}
          theme
          chosen={(themeId) => setTerminalAppearance({ themeId })}
        />
      </Panel>

      <Panel title={t("settings.terminalPanelType", "排版")}>
        <PanelRow
          label={t("settings.terminalFontLabel", "字体")}
          description={t(
            "settings.terminalFontDesc",
            "系统里没有的字体回退到内置的 Geist Mono，字形不会崩。",
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
          description={t("settings.terminalFontSizeDesc", "影响所有标签页；也可以用 Ctrl+Shift+= / -")}
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
          description={t("settings.terminalLineHeightDesc", "行距大一点，长段日志与流式输出更好读。")}
          values={TERMINAL_LINE_HEIGHTS}
          current={terminal.lineHeight}
          text={(height) => label(height, LINE_HEIGHT_LABELS)}
          chosen={(lineHeight) => setTerminalAppearance({ lineHeight })}
        />
      </Panel>

      <Panel title={t("settings.terminalPanelViewport", "光标与视口")}>
        <Choices
          label={t("settings.terminalCursorLabel", "光标样式")}
          description={t("settings.terminalCursorDesc", "方块是传统终端的样子，竖线更像现代编辑器。")}
          values={TERMINAL_CURSOR_STYLES}
          current={terminal.cursorStyle}
          text={(style) => label(style, CURSOR_LABELS)}
          chosen={(cursorStyle) => setTerminalAppearance({ cursorStyle })}
        />
        <PanelRow
          label={t("settings.terminalCursorBlinkLabel", "光标闪烁")}
          description={t("settings.terminalCursorBlinkDesc", "关掉就是常亮——录屏或截图时更干净。")}
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
            "文字与边框之间的呼吸区；改变它会让终端重新计算列宽。",
          )}
          values={TERMINAL_PADDINGS}
          current={terminal.padding}
          text={(level) => label(level, PADDING_LABELS)}
          chosen={(padding) => setTerminalAppearance({ padding })}
        />
        <PanelRow
          label={t("settings.terminalScrollbackLabel", "回滚行数")}
          description={t("settings.terminalScrollbackDesc", "向上能翻多少历史输出；调小会立刻丢掉超出的部分。")}
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

      <Panel>
        <PanelRow
          stacked
          label={t("settings.terminalShortcutsLabel", "键盘与鼠标")}
          description={t("settings.terminalShortcutsDesc", "只在终端面板里生效")}
        >
          <table className="table" style={{ borderTop: "1px solid var(--hairline)" }}>
            <tbody>
              {terminalKeys.map(([keys, what]) => (
                <tr key={keys}>
                  <td style={{ width: 260 }}>
                    <span className="kbd">{keys}</span>
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelRow>
      </Panel>
    </>
  );
}
