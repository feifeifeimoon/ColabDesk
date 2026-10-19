import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelLogin,
  logout,
  messageOf,
  onAuthDone,
  onAuthUrl,
  openExternal,
  startLogin,
  submitLoginCode,
} from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store";
import { Input } from "../../components/ui/Field";

/**
 * Drives the CLI's copy-paste OAuth flow for the user: the authorization URL
 * arrives as an event, the pasted code goes back through the child's stdin,
 * and the done event fires when that child exits.
 *
 * The URL itself is never printed. It is a few hundred characters of query
 * string, and the two things anybody does with it — open it again, or hand it
 * to another browser — are the two buttons beside it; a wall of it in a
 * textarea made the middle of an authorization flow read like raw output.
 */
export function LoginPanel({
  onFinished,
  authenticated = false,
  cancelWithEscape = false,
}: {
  /** Reloads environment status; resolves to the fresh authenticated flag. */
  onFinished: () => Promise<boolean>;
  authenticated?: boolean;
  /**
   * Whether Escape leaves the flow — the invisible way out, so that the screen
   * can be three things instead of four. The front door says yes (the key has
   * nothing else to do there); Settings says no, where Escape already means
   * "close settings", and one key with two meanings would cancel a login that
   * was being filled in.
   */
  cancelWithEscape?: boolean;
}) {
  const { t } = useTranslation();
  const setLoginRunning = useAppStore((state) => state.setLoginRunning);
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Memoised because the Escape handler below depends on it; everything it
  // touches is stable or a setter.
  const cancel = useCallback(async () => {
    await cancelLogin();
    setRunning(false);
    setLoginRunning(false);
    setUrl(null);
    setMessage(t("login.cancelled", "已取消登录。"));
  }, [setLoginRunning, t]);

  // A panel that goes away mid-flow (settings closed) leaves the screen focused
  // on a step nobody is on any more.
  useEffect(() => () => setLoginRunning(false), [setLoginRunning]);

  // Escape, for the front door only: the way out of a flow that has no visible
  // exit. Capture, so nothing under it swallows the key first.
  useEffect(() => {
    if (!running || !cancelWithEscape) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      void cancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancel, cancelWithEscape, running]);

  useEffect(() => {
    const unsubscribeUrl = onAuthUrl((payload) => {
      setUrl(payload.url);
      setError(null);
      setMessage(t("login.urlOpened", "浏览器已打开授权页面，完成登录后请将授权码粘贴至下方。"));
      openExternal(payload.url);
    });
    const unsubscribeDone = onAuthDone(() => {
      setRunning(false);
      setLoginRunning(false);
      setUrl(null);
      setCode("");
      void onFinished().then((authenticated) => {
        setMessage(
          authenticated
            ? t("login.authSuccess", "授权成功，凭证已保存。")
            : t("login.authFailed", "授权流程已完成，但未检测到有效凭据，请重试。"),
        );
      });
    });
    return () => {
      unsubscribeUrl();
      unsubscribeDone();
    };
  }, [onFinished, setLoginRunning, t]);

  async function begin() {
    setRunning(true);
    setLoginRunning(true);
    setError(null);
    setMessage(t("login.requestingUrl", "正在向 Google 申请授权链接…"));
    try {
      await startLogin();
    } catch (cause) {
      setRunning(false);
      setLoginRunning(false);
      setMessage(null);
      setError(messageOf(cause));
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await submitLoginCode(code);
      setMessage(t("login.submittingCode", "已提交授权码，正在等待验证结果…"));
      setCode("");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function handleLogout() {
    setError(null);
    try {
      await logout();
      await onFinished();
      setMessage(t("login.signedOut", "已退出登录，凭证已清除。"));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <div className="login">
      {running ? (
        <>
          {message && <p className="hint">{message}</p>}
          {url && (
            <form className="row" onSubmit={submit}>
              <Input
                className="login__code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("login.codePlaceholder", "粘贴 Google 显示的授权码")}
                autoFocus
              />
              <Button variant="primary" type="submit" disabled={!code.trim()}>
                {t("login.submitCode", "提交")}
              </Button>
            </form>
          )}
          {/* The ways around the field are one quiet line of text links: the
              field and its primary are the job, and a row of bordered buttons
              above them competed with the thing being asked for. Leaving is not
              one of them — three links in a row read as three equal choices —
              so it is Escape, and nothing is drawn for it. */}
          {url && (
            <div className="login__secondary">
              <Button variant="link" size="sm" onClick={() => openExternal(url)}>
                {t("login.openInBrowser", "在浏览器打开")}
              </Button>
              <span className="login__dot" aria-hidden="true">·</span>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  setMessage(t("login.urlCopied", "授权链接已复制。"));
                }}
              >
                {t("login.copyLink", "复制链接")}
              </Button>
            </div>
          )}
        </>
      ) : authenticated ? (
        <>
          <div className="row" style={{ gap: "var(--space-2)" }}>
            <Button variant="primary" onClick={begin}>
              {t("login.switchAccount", "切换账号 / 重新授权")}
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              {t("login.signOut", "退出登录")}
            </Button>
          </div>
          {message && <p className="hint">{message}</p>}
        </>
      ) : (
        <>
          <Button variant="primary" onClick={begin}>
            {t("login.signInGoogle", "授权登录 Google 账号")}
          </Button>
          {message && <p className="hint">{message}</p>}
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
