---
title: 用 ColabDesk + ComfyUI 生成带声音的 AI 视频
description: 从零创建 G4 会话、部署 ComfyUI、下载 MiniMax H3 官方权重，生成第一段带立体声的 MP4。
date: 2026-11-10
category: 教程
tags: [tutorial, comfyui, minimax]
cover: /assets/blog/minimax-h3-video/cover-zh.png
---

> 一份面向首次使用者的完整教程：在 Colab G4 运行时上部署 ComfyUI 与 MiniMax H3 开源权重，生成第一段带立体声的 MP4。
>
> 本文基于 ComfyUI 0.44 与 MiniMax H3 官方模板验证。全程不需要本地显卡。

| 项目 | 说明 |
| --- | --- |
| 难度 | 入门（会复制粘贴命令即可） |
| 首次耗时 | 约 40–60 分钟，其中模型下载 5–15 分钟 |
| 硬件 | Colab G4（NVIDIA RTX PRO 6000 Blackwell，96GB 显存） |
| 磁盘占用 | 约 60GB（模型 39GB + ComfyUI 与依赖） |
| 费用 | G4 参考 8.9 CU/小时，以 ColabDesk 状态栏的实时读数为准 |
| 产出 | 1344×768 / 24fps / 约 5 秒 / 带立体声音轨的 MP4 |

---

## 你将用到什么

- **ColabDesk**：桌面端 SSH 控制台。负责创建运行时、打开终端、浏览文件、查看算力消耗。
- **ComfyUI**：节点式生成界面，在运行时里以网页形式运行。
- **MiniMax H3**：开源的多模态视频模型，一次生成画面与声音。
- **Colab G4**：提供 96GB 显存的云端 GPU。

数据流：

![ColabDesk、Colab 运行时、ComfyUI 与浏览器之间的连接](/assets/blog/minimax-h3-video/pipeline.png)

> Colab 运行时没有公网 SSH 端口，也不对外暴露任意端口。第五步会用一条临时 HTTPS 隧道把 ComfyUI 的界面带到你的浏览器。

---

## 第一步：创建 G4 会话

1. 打开 ColabDesk，使用 Google 账号登录。
2. 点击 **New Session**，加速器选择 **G4**，会话命名（例如 `minimax-h3`），点击创建。
3. 等待状态变为 READY。终端会自动打开，工作目录是 `/content`。

在终端里确认硬件：

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
free -g
df -h /content
```

应当看到 `NVIDIA RTX PRO 6000 Blackwell Server Edition` 与约 `96GB` 显存。

> **注意**：`/content` 是临时磁盘。停止会话后，ComfyUI 与模型都会消失，下次需要重新执行第二、三步。生成结果请先下载到本地再停止会话。

<!-- 📷 截图：New Session 对话框，G4 选中状态 -->

---

## 第二步：安装 ComfyUI

在 ColabDesk 的终端里执行：

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

验证 PyTorch 与显卡：

```bash
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

期望输出类似：

```
2.11.0+cu128 True NVIDIA RTX PRO 6000 Blackwell Server Edition
```

如果 `cuda.is_available()` 为 `False`，或出现 `no kernel image is available`，说明 PyTorch wheel 与显卡架构不匹配，重新安装 cu128 版本。

---

## 第三步：下载模型

本教程只需要 5 个文件，合计约 **39GB**，全部来自官方 `Comfy-Org/MiniMax-H3` 仓库。

| 文件 | 大小 | 放置目录 |
| --- | ---: | --- |
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 19.53 GB | `models/diffusion_models/` |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 14.61 GB | `models/text_encoders/` |
| `minimax_h3_video_vae_int8_convrot.safetensors` | 2.62 GB | `models/vae/` |
| `minimax_h3_audio_vae_fp32.safetensors` | 0.56 GB | `models/vae/` |
| `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 1.82 GB | `models/loras/` |

在终端里执行：

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

校验：

```bash
find models -name "*.safetensors" -printf "%10s  %p\n" | sort -n
```

五个文件都应存在，且大小与上表一致。

> **国内网络**：如果 HuggingFace 直连较慢，把命令里的 `https://huggingface.co` 整体替换为 `https://hf-mirror.com`，其它不变。
>
> **非 Blackwell 显卡**：把文本编码器换成 `qwen3vl_32b_minimax_h3_int8_convrot.safetensors`（25.28GB），并在第六步模板的模型下拉框里选择它。NVFP4 权重需要 Blackwell 架构。

---

## 第四步：启动 ComfyUI

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

等待就绪：

```bash
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8188/ || true)
  [ "$code" = "200" ] && echo "ComfyUI ready" && break
  sleep 2
done
```

- `--highvram`：把权重尽量常驻显存，96GB 显卡推荐开启。
- `nohup ... &`：让 ComfyUI 脱离终端。关闭终端标签页或断开 ColabDesk 都不会中断生成。

如果一直没有输出 `ready`，查看日志：

```bash
tail -50 /content/comfyui.log
```

---

## 第五步：在浏览器里打开界面

Colab 没有固定的公网 IP，也只有一个 SSH 通道。最省事的做法是在运行时里启动一条临时 HTTPS 隧道：

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

复制输出的 `https://....trycloudflare.com` 地址，在本地浏览器打开。如果 12 秒后还没有打印地址，查看隧道日志：

```bash
tail -20 /content/cloudflared.log
```

第一次打开可能需要十几秒。若页面一直转圈，先在运行时里测一下延迟：

```bash
curl -s -o /dev/null -w "total=%{time_total}s\n" https://你的地址/system_stats
```

正常情况下应在 0.3 秒以内。如果达到秒级，说明隧道线路较差：

- 重新执行一次 `pkill -f cloudflared` 和上面的启动命令，换一个边缘节点；
- 仍不理想时，改用下面「直连 SSH 转发」的方式。

> **安全提示**：quick tunnel 的地址是公开的，任何拿到链接的人都能操作你的 ComfyUI。不要分享，用完执行 `pkill -f cloudflared` 关闭。

### 备选：直连 SSH 转发

如果隧道延迟始终很高，可以让本地 `ssh` 直接转发端口。代价是这条连接会占用运行时唯一的 SSH 通道，ColabDesk 在此期间无法连接：

1. 关闭 ColabDesk 中该会话的工作区（释放 SSH 连接）。
2. 在本地终端执行（别名由 ColabDesk 的 SSH 配置生成）：

```bash
ssh -N -L 8188:127.0.0.1:8188 colabdesk-你的会话名
```

3. 浏览器打开 `http://127.0.0.1:8188`。

<!-- 📷 截图：ComfyUI 首页 / Template Library -->

---

## 第六步：生成第一段视频

1. 在 ComfyUI 左侧边栏打开 **Workflows → Browse Templates**（或顶部菜单 **Workflow → Browse Templates**）。
2. 搜索并打开 **MiniMax H3: Text to Video**。
3. 画布上会显示一个大的 **Image to Video (MiniMax H3)** 节点，外圈可直接修改：
   - `prompt`：提示词；
   - `width / height`：分辨率，默认 `1344 × 768`；
   - 秒数：时长，默认 `5`（界面会自动吸附到模型允许的帧数）；
   - `noise_seed`：随机种子。
4. 确认五个模型下拉框选中了第三步下载的文件。若模板弹窗提示缺少模型，也可以直接点击弹窗里的 **Download**。

模板背后的节点图大致是这样，第一次跑不用改连线：

![ComfyUI 中 MiniMax H3 文生视频的节点图](/assets/blog/minimax-h3-video/workflow.png)

5. 点击 **Queue**。

第一次运行会把约 39GB 权重读入显存，进度条可能静止几十秒，这是正常现象。

完成后，成片位于：

```
/content/ComfyUI/output/video/MiniMax_H3_*.mp4
```

文件自带立体声音轨，可以直接播放。

<!-- 📷 截图：生成完成后的 SaveVideo 节点与输出文件 -->

---

## 第七步：把提示词写清楚

MiniMax H3 对结构化描述响应最好。一段可用的提示词通常包含五部分：

1. **画面与主体**：地点、人物、服装、关键道具；
2. **动作与时间轴**：用 `[0s-2s]`、`[2s-4s]` 标出每个阶段发生什么；
3. **镜头**：固定机位、推近、摇镜、跟拍；
4. **光线与质感**：光源、色温、胶片或写实风格；
5. **声音**：环境音、动作音效、配乐或台词。

示例：

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

几点经验：

- 英文提示词的稳定性通常优于中文；
- 时长越短，动作越容易做完整。5 秒内写 1–2 个动作即可；
- 不想要画面里的文字，明确写 `no subtitles, no text, no watermarks`；
- 想要特定运镜，写完整的「类型 + 幅度 + 速度」，例如 `pushes in with small amplitude at slow speed`。

---

## 第八步：取回结果并收尾

1. 在 ColabDesk 的文件面板进入 `/content/ComfyUI/output/video/`，右键下载 MP4。
2. 关闭隧道：

```bash
pkill -f cloudflared
```

3. 在 ColabDesk 中停止会话。

> 停止会话后 `/content` 会被清空。模型、ComfyUI 和未下载的成片都不会保留。

---

## 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 本地 `ssh -L` 连不上 | 运行时只接受一条 SSH 连接，ColabDesk 已占用 | 关闭 ColabDesk 的工作区后再连，或改用 HTTPS 隧道 |
| 隧道地址能打开但页面极慢 | Cloudflare quick tunnel 线路延迟高 | 用 `--protocol http2 --edge-ip-version 4` 重启；或改用 SSH 转发 |
| 页面一直转圈，日志正常 | 前端资源较大，首次加载慢 | 等待 1–2 分钟；按 F12 查看 Network 中哪个请求卡住 |
| `CUDA out of memory` | 分辨率或时长过高 | 把分辨率降到 `1024×576`，或时长降到 `3` 秒 |
| `torch.cuda.is_available()` 为 `False` | PyTorch 与显卡架构不匹配 | 重新安装 cu128 wheel |
| `no kernel image is available` | 同上 | 同上 |
| 模板里找不到 MiniMax | ComfyUI 版本过旧 | `cd /content/ComfyUI && git pull`，重启 |
| 模型下拉框为空 | 文件不在对应 `models/` 子目录 | 按第三步的表格检查路径 |
| 第一次 Queue 很久没动静 | 正在把 39GB 权重读入显存 | 等待；用 `nvidia-smi` 观察显存增长 |
| 输出没有声音 | 音频 VAE 未加载 | 检查 `minimax_h3_audio_vae_fp32` 与 `VAEDecodeAudio` 连线 |
| 会话重启后一切消失 | `/content` 是临时磁盘 | 重新执行第二、三步，或自行挂载 Google Drive 保存模型 |

---

## 进阶方向

跑通文字生成视频后，可以在同一套环境里继续：

- **图生视频**：打开模板 **MiniMax H3: Image to Video**，把首帧图接到节点左侧；
- **参考生视频**：打开 **MiniMax H3: Reference to Video**，用人物照片锁定长相；
- **更长、多镜头**：把多段 5–8 秒的片段分别生成，再在本地用剪辑软件拼接；
- **更高分辨率**：先生成 768p，再用单独的放大流程做 2K 输出。

模型与模板的完整列表见 ComfyUI 的 Template Library 与 [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)。

---

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

---

*本文基于 ComfyUI 0.44、MiniMax H3 官方模板与 Colab G4 实机验证。*
