---
title: 用 ColabDesk + ComfyUI 生成带声音的 AI 视频
description: 从一台空的 G4 运行时到一段带立体声的 MP4：安装 ComfyUI、下载 MiniMax H3 官方权重、跑通第一段视频。
date: 2026-11-10
category: 教程
tags: [tutorial, comfyui, minimax]
cover: /assets/blog/minimax-h3-video/cover-zh.png
---

> 你有一台 Colab G4，想生成一段带声音的视频，但不想先读完整套部署文档。
>
> 这篇教程只做一件事：从一台空的运行时开始，装好 ComfyUI 和 MiniMax H3 官方权重，跑出第一段带立体声的 MP4。每一步都有可复制的命令，以及「你应该看到什么」。

MiniMax H3 是一个 33B 的原生音视频模型：画面和声音在同一个扩散过程里生成，所以口型、环境音和动作是对齐的，不需要先出无声视频再后期配音。官方开源权重面向约 1 百万像素（768 短边）、24fps、最长约 15 秒；2K 是托管服务的能力，本地要另外做一次超分。

ComfyUI 是节点式生成界面，负责把模型、采样器和解码器连成一张图。ColabDesk 是连接 Colab 运行时的桌面控制台：创建 G4、打开终端、浏览文件、看算力消耗。三者拼起来，本地不需要显卡。

这篇教程覆盖：

① 这套工作流里每个部分分别在做什么；
② 为什么一张 96GB 的 G4 够用；
③ 怎么创建运行时、安装 ComfyUI、下载 39GB 权重；
④ 怎么把 ComfyUI 的界面带到浏览器；
⑤ 怎么生成第一段视频，提示词怎么写；
⑥ 出问题时先检查什么，最后怎么收尾。

| 项目 | 说明 |
| --- | --- |
| 你需要 | 一个能分配 G4 的 Colab 账号，以及已登录的 ColabDesk |
| 硬件 | Colab G4（RTX PRO 6000 Blackwell，96GB 显存） |
| 磁盘 | 约 60GB：39GB 权重 + ComfyUI 与依赖 |
| 首次耗时 | 约 40–60 分钟，其中下载 5–15 分钟 |
| 费用 | G4 参考 8.9 CU/小时，以 ColabDesk 状态栏为准 |
| 产出 | 1344×768、24fps、约 5 秒、带立体声的 MP4 |

---

## 1. 这套东西在做什么（一分钟版）

![图 1 · ColabDesk 通过 SSH 连接运行时；ComfyUI 通过临时 HTTPS 隧道到浏览器](/assets/blog/minimax-h3-video/pipeline.png)

把四个角色分开看：

- **ColabDesk**：桌面端 SSH 控制台。它创建 G4 会话，给你一个真实终端和 SFTP 文件面板，并显示这个运行时正在消耗多少计算单元。
- **Colab G4**：云端 GPU，96GB 显存。它跑 ComfyUI 和权重，关机后 `/content` 清空。
- **ComfyUI**：在运行时里以网页形式运行的节点式界面，默认只监听 `127.0.0.1:8188`。
- **MiniMax H3**：真正生成画面和声音的模型。

MiniMax H3 不是「先出无声视频，再对口型」。它是原生音视频联合模型，视频和音频在同一个潜空间里采样，所以说话、呼吸、环境音和动作是一起算出来的。这也是它比「视频模型 + 后期配音」更自然的原因。

代价是显存：33B 的模型即使做了裁剪和量化，权重仍有约 39GB；再加上采样时的激活值，24GB 或 48GB 的卡会频繁把权重换进换出，速度会慢到不适合迭代。G4 的 96GB 是这套工作流跑得舒服的前提，不是噱头。

## 2. 只靠五个文件就能跑

这套最小工作流只做「文字或图片 → 视频」这一件事，不额外加载多人一致性、潜空间超分或多段续接。它只需要五个文件：

| 文件 | 作用 | 大小 (GB) |
| --- | --- | ---: |
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 扩散模型，负责出画面 | 19.53 |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 文本编码器，负责读提示词 | 14.61 |
| `minimax_h3_video_vae_int8_convrot.safetensors` | 视频 VAE，潜空间 ↔ 像素 | 2.62 |
| `minimax_h3_audio_vae_fp32.safetensors` | 音频 VAE，潜空间 ↔ 32kHz 立体声 | 0.56 |
| `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 步数蒸馏 LoRA，让步数可以压得很低 | 1.82 |

合计约 39GB，全部来自官方 `Comfy-Org/MiniMax-H3` 仓库。

ComfyUI 的模板会把它们连成一张图。图大概长这样：

![图 2 · 模板的节点链：提示词 → 采样 → 视频与音频解码 → MP4](/assets/blog/minimax-h3-video/workflow.png)

这张图里只有三件事值得先记住：

- **提示词、分辨率、时长**都在 `MiniMax H3 Image to Video` 节点上；
- **采样器**用 `res_multistep`，模板默认 4 步；
- **视频和音频各走一个 VAE 解码**，最后在 `Create Video` 里合成 MP4。

时长不是随便填的。模型按 24fps 的帧网格生成，合法帧数满足 `17k + 5`；界面会把秒数吸附到最近的合法值。5 秒对应 124 帧（5.17 秒），这也是模板的默认值。第一次跑不需要改。

## 3. 把运行时和 ComfyUI 装好

### 3.1 创建 G4 会话

1. 打开 ColabDesk，登录 Google 账号。
2. 点击 **New Session**，加速器选 **G4**，命名（例如 `minimax-h3`），创建。
3. 等状态变成 READY。终端会打开在 `/content`。

在终端确认硬件：

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
free -g
df -h /content
```

你应该看到 `NVIDIA RTX PRO 6000 Blackwell Server Edition` 和约 `96GB` 显存。顺便看一眼系统内存和 `/content` 的可用空间：权重 39GB，加上 ComfyUI 和输出，留 60GB 以上比较稳。

> **注意**：`/content` 是临时磁盘。停止会话后 ComfyUI 和权重都会消失，下次要重做 3.2 和 3.3。成片先下载到本地再停会话。

### 3.2 安装 ComfyUI

在 ColabDesk 终端里：

```bash
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

python3 -m venv venv
source venv/bin/activate
pip install -U pip

# Blackwell 需要 CUDA 12.8 及以上的 PyTorch wheel
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

确认 PyTorch 认到了卡：

```bash
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

你应该看到类似：

```
2.11.0+cu128 True NVIDIA RTX PRO 6000 Blackwell Server Edition
```

如果 `cuda.is_available()` 是 `False`，或者出现 `no kernel image is available`，说明 wheel 和显卡架构不匹配。重新装 cu128 版本，不要继续往下走。

### 3.3 下载模型

在同一个终端里：

```bash
apt-get update -qq && apt-get install -y -qq aria2

cd /content/ComfyUI
mkdir -p models/{diffusion_models,text_encoders,vae,loras}

dl() {
  aria2c -x 16 -s 16 -k 1M --continue=true --file-allocation=none \
    --console-log-level=warn -d "$(dirname "$2")" -o "$(basename "$2")" "$1"
}

B=https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main

dl $B/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors \
   models/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors

dl $B/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors \
   models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors

dl $B/vae/minimax_h3_video_vae_int8_convrot.safetensors \
   models/vae/minimax_h3_video_vae_int8_convrot.safetensors

dl $B/vae/minimax_h3_audio_vae_fp32.safetensors \
   models/vae/minimax_h3_audio_vae_fp32.safetensors

dl $B/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors \
   models/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors
```

下载完成后检查：

```bash
find models -name "*.safetensors" -printf "%10s  %p\n" | sort -n
```

五个文件都在，大小与第 2 节的表一致。

> **国内网络**：如果 HuggingFace 直连慢，把命令里的 `https://huggingface.co` 换成 `https://hf-mirror.com`，其它不变。
>
> **不是 Blackwell**：把文本编码器换成 `qwen3vl_32b_minimax_h3_int8_convrot.safetensors`（25.28GB），第 5 节在模板里选它。NVFP4 需要 Blackwell。

## 4. 把界面带到浏览器

### 4.1 启动 ComfyUI

```bash
cd /content/ComfyUI
source venv/bin/activate

nohup python main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --highvram \
  --disable-mmap \
  > /content/comfyui.log 2>&1 &
```

等待它回答：

```bash
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8188/ || true)
  [ "$code" = "200" ] && echo "ComfyUI ready" && break
  sleep 2
done
```

看到 `ready` 再往下。如果一直没有，先看日志：

```bash
tail -50 /content/comfyui.log
```

三个参数的理由：

- `--listen 127.0.0.1`：只监听本机，界面通过隧道访问，不直接暴露在公网；
- `--highvram`：96GB 显存，让权重尽量常驻，不要在采样中途换出；
- `nohup ... &`：让 ComfyUI 脱离终端。关标签页或断开 ColabDesk 不会中断生成。

### 4.2 开一条临时隧道

Colab 没有固定的公网 IP，也不对外暴露 8188。运行时只有一个 SSH 通道，ColabDesk 已经占着它。所以不要在本地再 `ssh -L`，而是在运行时里开一条出站 HTTPS 隧道：

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

pkill -f cloudflared 2>/dev/null || true

nohup cloudflared tunnel \
  --protocol http2 \
  --edge-ip-version 4 \
  --no-autoupdate \
  --url http://127.0.0.1:8188 \
  > /content/cloudflared.log 2>&1 &

sleep 12
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /content/cloudflared.log | tail -1
```

复制输出的 `https://....trycloudflare.com`，在本地浏览器打开。

第一次打开可能需要十几秒。如果页面一直转圈，先在运行时里量一下延迟：

```bash
curl -s -o /dev/null -w "total=%{time_total}s\n" https://你的地址/system_stats
```

正常应该在 0.3 秒以内。如果是秒级，先换一个边缘节点：`pkill -f cloudflared`，再执行一次启动命令。仍然慢就走 4.3。

> **安全**：quick tunnel 的地址是公开的，拿到链接的人都能操作你的 ComfyUI。不要分享，用完 `pkill -f cloudflared`。

### 4.3 如果隧道很慢：改用 SSH 转发

如果隧道延迟一直很高，可以让本地 `ssh` 直接转发端口。代价是这条连接会占用运行时唯一的 SSH 通道，ColabDesk 在此期间连不上：

1. 关闭 ColabDesk 里这个会话的工作区，释放 SSH 连接。
2. 在本地终端执行（别名由 ColabDesk 的 SSH 配置生成）：

```bash
ssh -N -L 8188:127.0.0.1:8188 colabdesk-你的会话名
```

3. 浏览器打开 `http://127.0.0.1:8188`。

ComfyUI 是 `nohup` 起的，不受影响。用完 `Ctrl+C`，ColabDesk 才能重新接管。

## 5. 生成第一段视频

### 5.1 打开官方模板

在 ComfyUI 左侧边栏打开 **Workflows → Browse Templates**（或顶部 **Workflow → Browse Templates**），搜索并打开 **MiniMax H3: Text to Video**。

画布上是一个大的 **Image to Video (MiniMax H3)** 节点。模板已经连好线，第一次不需要改。

### 5.2 认识画布上的控件

外圈可以直接改：

| 控件 | 含义 | 第一次建议 |
| --- | --- | --- |
| `prompt` | 提示词 | 先别改，用模板自带的 |
| `width` / `height` | 分辨率 | 保持 `1344 × 768` |
| 秒数 | 时长，自动吸附到合法帧数 | 保持 `5`（124 帧） |
| `noise_seed` | 随机种子 | 不动 |
| 模型下拉框 | 五个权重 | 确认指向第 2 节下载的文件 |

如果模板弹窗提示缺少模型，可以直接点弹窗里的 **Download**。下载完确认下拉框指向的是同一批文件。

### 5.3 点 Queue，等它出片

点 **Queue**。第一次运行会把约 39GB 权重读进显存，进度条可能静止几十秒，这是正常的。另开一个终端看显存：

```bash
watch -n 2 nvidia-smi
```

出片后，文件在：

```
/content/ComfyUI/output/video/MiniMax_H3_*.mp4
```

自带立体声音轨，可以直接播放。第一次不用追求完美，先确认三件事：画面能动、有声音、没有报错。这三件事成立，再改提示词和时长。

## 6. 提示词怎么写才不浪费一次生成

### 6.1 五段结构

MiniMax H3 对结构化描述响应最好。一段可用的提示词通常有五部分：

1. **画面与主体**：地点、人物、服装、关键道具；
2. **动作与时间轴**：用 `[0s-2s]`、`[2s-4s]` 标出每个阶段；
3. **镜头**：固定、推近、摇镜、跟拍；
4. **光线与质感**：光源、色温、胶片或写实风格；
5. **声音**：环境音、动作音效、配乐或台词。

### 6.2 一个可用的例子

```text
A quiet rainy street at night, neon signs reflecting on wet asphalt.
A woman in a dark coat stands under a bus stop, holding a folded umbrella.

Timeline:
[0s-2s] She looks up as rain intensifies; droplets streak across the neon light.
[2s-5s] She opens the umbrella and steps toward the curb as a taxi approaches.

Camera: static medium shot, slight handheld breathing.
Look: cinematic realism, cool blue and warm orange contrast, shallow depth of field, film grain.
Audio: steady rain, distant traffic, footsteps on wet pavement, a low ambient drone.
```

### 6.3 几条经验

- 英文提示词的稳定性通常优于中文；
- 5 秒内写 1–2 个动作，动作越多越容易糊；
- 不想要画面里的文字，明确写 `no subtitles, no text, no watermarks`；
- 想要特定运镜，写完整的「类型 + 幅度 + 速度」，例如 `pushes in with small amplitude at slow speed`；
- 声音不是后期配的，提示词里的 `Audio:` 会直接影响生成结果，别只写画面。

## 7. 出问题先看这里

### 7.1 页面打不开，或者很慢

先确认 ComfyUI 本身是好的：

```bash
curl -s -o /dev/null -w "local=%{http_code} %{time_total}s\n" http://127.0.0.1:8188/
curl -s -o /dev/null -w "tunnel=%{http_code} %{time_total}s\n" https://你的地址/system_stats
```

- `local` 不是 200：ComfyUI 没起来，看 `/content/comfyui.log`；
- `local` 快、`tunnel` 慢：隧道线路问题，按 4.2 换节点，或走 4.3；
- 两个都快、浏览器慢：本地到 Cloudflare 的线路，换网络或代理模式再试。

### 7.2 CUDA out of memory

把分辨率降到 `1024×576`，或时长降到 `3` 秒。确认没有别的进程占着显存：

```bash
nvidia-smi
```

如果还是 OOM，说明这个会话的显存或系统内存不够，换一个 G4 会话再试。

### 7.3 模型下载失败

- 401/403：仓库是公开的，一般不需要 token；如果用了镜像，确认镜像地址正确；
- 很慢或中断：aria2 支持断点续传，重新执行同一条命令即可；
- 文件大小不对：删掉重下，不要用半个文件去启动。

### 7.4 成片没有声音

检查 `minimax_h3_audio_vae_fp32.safetensors` 是否在 `models/vae/`，以及模板里 `VAEDecodeAudio` 是否接着音频 VAE。声音是模型原生生成的，不需要额外配音插件。

### 7.5 重启后一切消失

`/content` 是临时磁盘，停止会话就清空。这是 Colab 的行为，不是 ColabDesk 的缓存问题。下次重新执行 3.2 和 3.3；想省下载时间，可以把模型放到 Google Drive，再软链回 `models/`。

### 7.6 其他常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `torch.cuda.is_available()` 为 `False` | PyTorch 与显卡架构不匹配 | 重装 cu128 wheel |
| `no kernel image is available` | 同上 | 同上 |
| 模板里找不到 MiniMax | ComfyUI 太旧 | `cd /content/ComfyUI && git pull`，重启 |
| 模型下拉框为空 | 文件不在对应 `models/` 子目录 | 按第 2 节的表检查路径 |
| 第一次 Queue 很久没动静 | 正在把权重读进显存 | 等；用 `nvidia-smi` 看显存增长 |
| 本地 `ssh -L` 连不上 | 运行时只有一条 SSH，ColabDesk 已占用 | 关闭工作区后再连，或走隧道 |

## 8. 收尾：把成片拿走，把算力关掉

1. 在 ColabDesk 文件面板进入 `/content/ComfyUI/output/video/`，下载 MP4。
2. 关闭隧道：

```bash
pkill -f cloudflared
```

3. 在 ColabDesk 里停止会话。

> 停止会话后 `/content` 清空，模型、ComfyUI 和没下载的成片都不会保留。G4 按小时计费，生成完就停，别让它空转。

## 9. 接下来可以做什么

跑通文字生成视频后，同一套环境还能做：

- **图生视频**：打开 **MiniMax H3: Image to Video**，把首帧图接到节点左侧；
- **参考生视频**：打开 **MiniMax H3: Reference to Video**，用人物照片锁定长相；
- **更长、多镜头**：把多段 5–8 秒的片段分别生成，再在本地剪辑；
- **更高分辨率**：先生成 768p，再单独做一次放大；
- **更复杂的连续性**：多人同框、跨段续接、远景小脸精修，是另一层能力；先把最小版本跑熟，再往上加。

模型和模板的完整列表在 ComfyUI 的 Template Library 和 [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)。

---

*本文基于 ComfyUI 0.44、MiniMax H3 官方模板和 Colab G4 实机验证。*

## 附录 A：从零到启动的完整命令

```bash
# 1. 安装 ComfyUI
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m venv venv
source venv/bin/activate
pip install -U pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt

# 2. 下载模型
apt-get update -qq && apt-get install -y -qq aria2
mkdir -p models/{diffusion_models,text_encoders,vae,loras}
dl() { aria2c -x 16 -s 16 -k 1M --continue=true --file-allocation=none \
  --console-log-level=warn -d "$(dirname "$2")" -o "$(basename "$2")" "$1"; }
B=https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main
dl $B/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors \
   models/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors
dl $B/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors \
   models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors
dl $B/vae/minimax_h3_video_vae_int8_convrot.safetensors \
   models/vae/minimax_h3_video_vae_int8_convrot.safetensors
dl $B/vae/minimax_h3_audio_vae_fp32.safetensors \
   models/vae/minimax_h3_audio_vae_fp32.safetensors
dl $B/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors \
   models/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors

# 3. 启动
nohup python main.py --listen 127.0.0.1 --port 8188 --highvram --disable-mmap \
  > /content/comfyui.log 2>&1 &

# 4. 隧道
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
nohup cloudflared tunnel --protocol http2 --edge-ip-version 4 --no-autoupdate \
  --url http://127.0.0.1:8188 > /content/cloudflared.log 2>&1 &
sleep 12
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /content/cloudflared.log | tail -1
```

## 附录 B：使用须知

- ColabDesk 是第三方工具，与 Google 无隶属关系；Colab 的可用机型与配额由你的账号决定。
- MiniMax H3 为开源权重，商用授权请以模型发布方与 Comfy 的条款为准。
- 生成内容的使用与传播需遵守当地法律与平台规范。
