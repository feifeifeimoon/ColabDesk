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
      "ColabDesk's workbench: the session rail on the left, terminal in the middle, files panel on the right, and the compute-unit status bar along the bottom",
    "features.title": "What it does",
    "features.terminal.title": "Terminal",
    "features.terminal.body":
      "Many tabs per runtime over one SSH connection — search, clickable links, ten palettes that follow the light/dark theme.",
    "features.terminal.alt": "ColabDesk in focus mode: a full-window terminal on one runtime",
    "features.files.title": "Files",
    "features.files.body":
      "The runtime's filesystem as a tree: drag to upload files or whole folders, download, delete, with progress, and you can cancel.",
    "features.files.alt": "ColabDesk's files panel: the runtime's filesystem as a tree",
    "features.quota.title": "Quota",
    "features.quota.body":
      "Balance, spend rate, projected hours, and a day/week/month trend built from readings the app records.",
    "features.quota.alt": "ColabDesk's quota trend: compute units spent per day, week or month",
    "footer.rights": "© ColabDesk · Apache-2.0",
    "footer.unofficial": "Unofficial, not affiliated with Google.",
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
    "hero.alt": "ColabDesk 工作台：左侧会话栏，中间终端，右侧文件面板，底部是计算单元状态栏",
    "features.title": "功能",
    "features.terminal.title": "终端",
    "features.terminal.body":
      "每个运行时通过一条 SSH 连接打开多个标签页——搜索、可点击链接、跟随明暗主题的十套配色。",
    "features.terminal.alt": "ColabDesk 专注模式：占满窗口的运行时终端",
    "features.files.title": "文件",
    "features.files.body":
      "运行时的文件系统是一棵树：拖拽上传文件或整个文件夹，下载、删除，全程有进度、可取消。",
    "features.files.alt": "ColabDesk 的文件面板：运行时的文件树",
    "features.quota.title": "额度",
    "features.quota.body":
      "余额、消耗速率、预计可用小时，以及由应用记录读数生成的日/周/月趋势。",
    "features.quota.alt": "ColabDesk 的额度趋势：计算单元按日/周/月消耗",
    "footer.rights": "© ColabDesk · Apache-2.0",
    "footer.unofficial": "非官方产品，与 Google 无关。",
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
