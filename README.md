# ColabDesk

非官方 Google Colab 桌面客户端：会话、额度、终端与文件传输。与 Google 无关联。

## 下载

到 [Releases](https://github.com/feifeifeimoon/ColabDesk/releases/latest) 取：

- **Windows**：`colabdesk-setup-<版本>-x64.exe`
- **macOS**：`colabdesk-<版本>-<架构>.dmg`（Apple Silicon 用 `arm64`，Intel 用 `x64`）

应用内置了 Python 运行时与 `colab` CLI，不需要另装 Python。

## 安装

**这些包没有代码签名**，所以系统会拦一下。这不是出错，是正常的。

### Windows

安装包会触发 SmartScreen 的「Windows 已保护你的电脑」提示。点 **更多信息 → 仍要运行**。

安装是当前用户级别的（不需要管理员权限）。卸载在「设置 → 应用」里，**不会**删除你的用量历史与 Colab 授权。

### macOS

首次打开会提示「无法验证是否含恶意软件」。到 **系统设置 → 隐私与安全性**，在下面找到 ColabDesk 并点
**仍要打开**，再确认一次。之后它就作为例外被记住了。

请**不要**为了这个应用全局关闭 Gatekeeper。

> 为什么没签名：Apple Developer Program 每年 $99，Windows 代码签名证书对个人开发者还有地区限制。
> 两项都在计划里，但还没到位。签名一旦就位，上面这些步骤都会消失。

## 开发

见 [`AGENTS.md`](AGENTS.md)。
