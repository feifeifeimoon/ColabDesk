import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/ui/Button";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "../../components/ui/icons";

/**
 * The terminal's find bar: one field and the two directions a match can be in.
 *
 * It sits above the terminal rather than floating over it, so the grid the user
 * is reading keeps its rows. Its controls carry labels of their own — the bar is
 * reached by a keystroke, and someone who got there by keyboard needs to hear
 * what each button does.
 */
export function TerminalSearchBar({
  value,
  onChange,
  onSubmit,
  onNext,
  onPrevious,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Enter: the next match, as in every other search field. */
  onSubmit: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <form
      className="terminal-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <input
        className="input"
        data-testid="terminal-search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("terminal.searchPlaceholder", "在终端里查找")}
        aria-label={t("terminal.searchPlaceholder", "在终端里查找")}
        autoFocus
      />
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        label={t("terminal.searchPrevious", "上一个")}
        onClick={onPrevious}
        disabled={!value}
      >
        <ChevronUpIcon size={14} />
      </IconButton>
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        label={t("terminal.searchNext", "下一个")}
        onClick={onNext}
        disabled={!value}
      >
        <ChevronDownIcon size={14} />
      </IconButton>
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        label={t("terminal.searchClose", "关闭查找")}
        onClick={onClose}
      >
        <CloseIcon />
      </IconButton>
    </form>
  );
}
