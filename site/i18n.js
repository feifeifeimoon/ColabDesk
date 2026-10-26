// The landing page's two languages. It is deliberately not the app's catalog:
// this page has no build step, and its copy is written for someone who has not
// installed anything yet. The page itself only carries data-i18n keys, so a
// missing key is a bug the parity test in i18n.test.mjs catches, not a
// half-translated page.
export const I18N = {
  en: {
    "meta.title": "ColabDesk — a desktop SSH console for Google Colab runtimes",
    "nav.star": "Star ColabDesk on GitHub",
    "nav.github": "GitHub",
    "lang.group": "Language",
    "hero.title": "A desktop SSH console\nfor Google Colab runtimes.",
    "hero.sub":
      "SSH in, work in a real terminal, browse the runtime's files over SFTP, and watch the compute units it is spending — in one window.",
    "hero.download.win": "Download for Windows",
    "hero.download.mac": "Download for macOS",
    "hero.download.any": "Download",
    "hero.github": "View on GitHub",
    "alt.label.mac": "Also for macOS",
    "alt.label.win": "Also for Windows",
    "alt.label.all": "All platforms",
    "alt.label.other": "Other downloads",
    "alt.win.title": "Windows x64",
    "alt.win.meta": "Installer (.exe)",
    "alt.mac.arm.title": "macOS Apple silicon",
    "alt.mac.arm.meta": "M-series Macs (.dmg)",
    "alt.mac.x64.title": "macOS Intel",
    "alt.mac.x64.meta": "Intel Macs (.dmg)",
    "hero.alt":
      "ColabDesk's workbench: the session rail on the left, a Qwen chat running in the terminal, vLLM server logs, an nvidia-smi GPU readout, and the compute-unit status bar along the bottom",
    "footer.tagline": "A desktop SSH console for Google Colab runtimes.",
    "footer.capabilities": "Terminal · Files · Editor · Sessions · Quota · SSH",
    "footer.product": "Product",
    "footer.resources": "Resources",
    "footer.download": "Download",
    "footer.releases": "Releases",
    "footer.issues": "Issues",
    "footer.readme": "README",
    "footer.license": "License",
    "footer.rights": "© ColabDesk · Apache-2.0",
    "footer.unofficial": "Unofficial, not affiliated with Google. Colab is a trademark of Google LLC.",
    "footer.github": "GitHub",
  },
  zh: {
    "meta.title": "ColabDesk — Google Colab 运行时的桌面 SSH 控制台",
    "nav.star": "在 GitHub 上为 ColabDesk 加星",
    "nav.github": "GitHub",
    "lang.group": "语言",
    "hero.title": "Google Colab 运行时的\n桌面 SSH 控制台",
    "hero.sub":
      "SSH 登录，在真正的终端里工作，用 SFTP 浏览运行时文件，并查看它消耗的计算单元——全在一个窗口里。",
    "hero.download.win": "下载 Windows 版",
    "hero.download.mac": "下载 macOS 版",
    "hero.download.any": "下载",
    "hero.github": "在 GitHub 上查看",
    "alt.label.mac": "另可下载 macOS 版",
    "alt.label.win": "另可下载 Windows 版",
    "alt.label.all": "全部平台",
    "alt.label.other": "其他下载",
    "alt.win.title": "Windows x64",
    "alt.win.meta": "安装包（.exe）",
    "alt.mac.arm.title": "macOS Apple 芯片",
    "alt.mac.arm.meta": "M 系列芯片（.dmg）",
    "alt.mac.x64.title": "macOS Intel",
    "alt.mac.x64.meta": "Intel 芯片（.dmg）",
    "hero.alt":
      "ColabDesk 工作台：左侧是会话栏，终端里正在与 Qwen 对话，右侧是 vLLM 服务日志，下方是 nvidia-smi 的 GPU 读数，底部是计算单元状态栏",
    "footer.tagline": "Google Colab 运行时的桌面 SSH 控制台。",
    "footer.capabilities": "终端 · 文件 · 编辑器 · 会话 · 额度 · SSH",
    "footer.product": "产品",
    "footer.resources": "资源",
    "footer.download": "下载",
    "footer.releases": "版本发布",
    "footer.issues": "问题反馈",
    "footer.readme": "说明文档",
    "footer.license": "许可证",
    "footer.rights": "© ColabDesk · Apache-2.0",
    "footer.unofficial": "非官方产品，与 Google 无关。Colab 是 Google LLC 的商标。",
    "footer.github": "GitHub",
  },
};

export const FALLBACK_LANG = "en";

export const LANGUAGE_STORAGE_KEY = "colabdesk-lang";

/** A saved choice wins; otherwise a Chinese browser gets Chinese, everyone else English. */
export function initialLanguage(navigatorLanguage, stored) {
  if (stored === "en" || stored === "zh") return stored;
  const browser = typeof navigatorLanguage === "string" ? navigatorLanguage.toLowerCase() : "";
  return browser.startsWith("zh") ? "zh" : FALLBACK_LANG;
}

/**
 * Storage is not always there: sandboxed frames and blocked cookies make even
 * reading throw. A missing store costs the memory of the choice, never the page.
 */
export function readStoredLanguage(storage) {
  try {
    return storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveLanguage(storage, lang) {
  try {
    storage?.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // The switch still applies for this visit.
  }
}
