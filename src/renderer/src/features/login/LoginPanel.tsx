import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelLogin,
  messageOf,
  onAuthDone,
  onAuthUrl,
  openExternal,
  startLogin,
  submitLoginCode,
} from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { RawOutput } from "../../components/ui/RawOutput";

/**
 * Drives the CLI's copy-paste OAuth flow for the user: the authorization URL
 * arrives as an event, the pasted code goes back through the child's stdin,
 * and the done event fires when that child exits.
 */
export function LoginPanel({
  onFinished,
}: {
  /** Reloads environment status; resolves to the fresh authenticated flag. */
  onFinished: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeUrl = onAuthUrl((payload) => {
      setUrl(payload.url);
      setError(null);
      setMessage(t("login.urlOpened", "授权页面已在浏览器打开。登录后把 Google 显示的授权码粘贴到下方。"));
      openExternal(payload.url);
    });
    const unsubscribeDone = onAuthDone((payload) => {
      setRunning(false);
      setUrl(null);
      setCode("");
      setOutput(payload.output);
      void onFinished().then((authenticated) => {
        setMessage(
          authenticated
            ? t("login.authSuccess", "授权成功，凭证已保存。")
            : t("login.authFailed", "登录流程已结束，但未检测到凭证，请重试。"),
        );
      });
    });
    return () => {
      unsubscribeUrl();
      unsubscribeDone();
    };
  }, [onFinished, t]);

  async function begin() {
    setRunning(true);
    setError(null);
    setMessage(t("login.requestingUrl", "正在向 Google 申请授权链接…"));
    setOutput("");
    try {
      await startLogin();
    } catch (cause) {
      setRunning(false);
      setMessage(null);
      setError(messageOf(cause));
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await submitLoginCode(code);
      setMessage(t("login.submittingCode", "已提交授权码，等待 Google 返回结果…"));
      setCode("");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function cancel() {
    await cancelLogin();
    setRunning(false);
    setUrl(null);
    setMessage(t("login.cancelled", "已取消登录。"));
  }

  return (
    <div className="login">
      {!running ? (
        <Button variant="primary" onClick={begin}>
          {t("login.signInGoogle", "授权登录 Google 账号")}
        </Button>
      ) : (
        <Button variant="outline" onClick={cancel}>
          {t("login.cancelLogin", "取消登录")}
        </Button>
      )}

      {message && <p className="hint">{message}</p>}
      {error && <p className="error">{error}</p>}

      {url && (
        <div className="auth-url">
          <textarea className="input" readOnly value={url} rows={3} onFocus={(e) => e.target.select()} />
          <div className="row">
            <Button variant="outline" size="sm" onClick={() => openExternal(url)}>
              {t("login.openInBrowser", "在浏览器打开")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(url);
                setMessage(t("login.urlCopied", "授权链接已复制。"));
              }}
            >
              {t("login.copyLink", "复制链接")}
            </Button>
          </div>
        </div>
      )}

      {running && url && (
        <form className="row" onSubmit={submit}>
          <Input
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

      <RawOutput text={output} label={t("login.rawOutputLabel", "登录过程输出")} />
    </div>
  );
}
