---
title: 用 ColabDesk + ComfyUI 生成 AI 图像（MiniMax H3）
description: 从一个空的 G4 会话到一张 1344×768 的 PNG：安装 ComfyUI、下载 MiniMax H3 官方权重、跑通第一张图。
date: 2026-11-13
category: 教程
tags: [教程, ComfyUI, MiniMax]
cover: /assets/blog/minimax-h3-image/cover-zh.png
---

> 你有一台 Colab G4，想用一句话生成一张图，但不想先搭完整套视频工作流。
>
> 这篇教程只做一件事：从一个空的 G4 会话开始，装好 ComfyUI 和 MiniMax H3 官方权重，跑出第一张 1344×768 的 PNG。每一步都有可复制的命令，以及「你应该看到什么」。

MiniMax H3 是一个 330 亿参数的原生音视频模型。它最常被用来生成带声音的视频，但同一套权重也能只生成一帧：ComfyUI 的 **MiniMax H3: Text to Image** 模板把音视频联合建模的能力收在一次采样里，输出一张静态图。没有音频，也没有时间轴，所以它比视频模板快得多，适合先把提示词、构图和光线调好，再拿同样的描述去生成视频。

ComfyUI 是节点式生成界面，负责把模型、采样器和解码器连成一张图。ColabDesk 是连接 Colab 会话的桌面控制台：创建 G4、打开终端、浏览文件、看算力消耗。它们拼起来，本地不需要显卡。

这篇教程覆盖：

- 生图模板里每个节点分别在做什么；
- 为什么一张 96GB 的 G4 够用；
- 怎么创建会话、安装 ComfyUI、下载约 41GB 权重；
- 怎么把 ComfyUI 的界面带到浏览器；
- 怎么生成第一张图，提示词怎么写；
- 出问题时先检查什么，最后怎么收尾。

| 项目 | 说明 |
| --- | --- |
| 你需要 | 一个能分配 G4 的 Colab 账号，以及已登录的 ColabDesk |
| 硬件 | Colab G4（RTX PRO 6000 Blackwell，96GB 显存） |
| 磁盘 | 约 60GB：41GB 权重 + ComfyUI 与依赖 |
| 首次耗时 | 约 30–40 分钟，其中下载 3–10 分钟 |
| 费用 | G4 参考 8.9 计算单元/小时（Colab 的计费单位），以 ColabDesk 状态栏为准 |
| 产出 | 1344×768 的 PNG，本次实测约 1.4MB |

---

## 1. 这套东西在做什么（一分钟版）

![图 1 · ColabDesk 通过 SSH 连接 Colab 会话；ComfyUI 通过临时 HTTPS 隧道到浏览器](/assets/blog/minimax-h3-image/pipeline.png)

把四个角色分开看：

- **ColabDesk**：桌面端 SSH 控制台。它创建 G4 会话，给你一个真实终端和文件面板，并显示这个会话正在消耗多少计算单元。
- **Colab G4**：云端 GPU，96GB 显存。它跑 ComfyUI 和权重，关机后 `/content` 清空。
- **ComfyUI**：在会话里以网页形式运行的节点式界面，默认只监听 `127.0.0.1:8188`。
- **MiniMax H3**：真正生成画面的模型。

生图模板不生成视频，也不生成声音。它把提示词编码成模型能读的表示，在模型内部的压缩表示（潜空间）里从噪声开始去噪，最后只把画面部分还原成像素。一次采样只出一帧，所以没有帧与帧之间的连续性问题，速度也快得多。

代价仍然是显存：330 亿参数的模型即使做了裁剪和量化，权重仍有约 41GB；采样时还要放激活值。本次实测一张 1344×768 的图占用约 59GB 显存，G4 的 96GB 留出了足够余量。24GB 或 48GB 的卡会频繁把权重换进换出，速度会慢到不适合迭代。

## 2. 只靠四个文件就能跑

这套最小生图工作流只做「文字 → 图像」这一件事，不额外加载图生图、超分或多图一致性。它只需要四个文件：

| 文件 | 作用 | 大小 (GB) |
| --- | --- | ---: |
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 扩散模型，负责出画面 | 19.53 |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 文本编码器，把提示词变成模型能读的表示 | 14.61 |
| `minimax_h3_video_vae_fp16.safetensors` | 视频解码器（VAE），把模型内部表示还原成画面 | 4.85 |
| `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 加速 LoRA（一小块附加权重），让步数可以压到 8 | 1.82 |

合计约 41GB，全部来自官方 `Comfy-Org/MiniMax-H3` 仓库。

ComfyUI 的模板会把它们连成一张图。生图模板比视频模板短很多：

![图 2 · 生图模板的节点链：提示词与空画布 → 采样 → 取出画面 → PNG](/assets/blog/minimax-h3-image/workflow.png)

这张图里只有四件事值得先记住：

- **提示词**在 `CLIP Text Encode` 节点里；
- **分辨率**在 `EmptyLatentImage` 节点上，模板默认 `1344 × 768`；
- **采样器**用 `res_multistep`；接上 turbo LoRA 时 8 步就够，不接时用基础模型的 30 步；
- **`LTXVSeparateAVLatent` 把画面部分拆出来**，`VAEDecode` 还原成 PNG。图像模板不接音频解码，所以没有声音。

`minimax_h3_video_vae_fp16.safetensors` 的名字里有 `video`，是因为它本来就是视频模型的 VAE；生图模板只是拿它解码一帧。不要换成 int8 版：模板默认指向 fp16 版，第一次先保持一致，确认链路通了再考虑替换。

## 3. 把会话和 ComfyUI 装好

### 3.1 创建 G4 会话

1. 打开 ColabDesk，登录 Google 账号。
2. 点击 **New Session**，加速器选 **G4**，命名（例如 `minimax-image`），创建。
3. 等状态变成 READY。终端会打开在 `/content`。

在终端确认硬件：

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
```

你应该看到类似：

```
NVIDIA RTX PRO 6000 Blackwell Server Edition, 97887 MiB
```

### 3.2 安装 ComfyUI

在 ColabDesk 终端里：

```bash
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Colab 的 Python 可能没有 ensurepip；virtualenv 自带 pip
python3 -m pip install --upgrade virtualenv
python3 -m virtualenv venv
source venv/bin/activate
pip install -U pip

# Blackwell 需要 CUDA 12.8 及以上的 PyTorch wheel
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

> **如果 `python3 -m venv venv` 报 `ensurepip returned non-zero exit status 1`**：这是 Colab 镜像的已知问题，不是命令写错。上面的 `virtualenv` 方式自带 pip，会绕过 ensurepip。

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

dl $B/vae/minimax_h3_video_vae_fp16.safetensors \
   models/vae/minimax_h3_video_vae_fp16.safetensors

dl $B/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors \
   models/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors
```

下载完成后检查：

```bash
find models -name "*.safetensors" -printf "%10s  %p\n" | sort -n
```

四个文件都在，大小与第 2 节的表一致。

> **国内网络**：如果 HuggingFace 直连慢，把命令里的 `https://huggingface.co` 换成 `https://hf-mirror.com`，其它不变。
>
> **不是 Blackwell**：把文本编码器换成 `qwen3vl_32b_minimax_h3_int8_convrot.safetensors`（25.28GB）。这样总权重会到约 51GB，40GB 的 A100 放不下；先用 G4 跑通，再考虑换卡。

## 4. 把界面带到浏览器

### 4.1 启动 ComfyUI

```bash
cd /content/ComfyUI
source venv/bin/activate
nohup python main.py --listen 127.0.0.1 --port 8188 --highvram --disable-mmap \
  > /content/comfyui.log 2>&1 &
```

`--highvram` 让 ComfyUI 尽量把权重留在显存里，`--disable-mmap` 避免 Colab 的磁盘映射拖慢第一次加载。

等十几秒，确认本地能打开：

```bash
curl -s -o /dev/null -w "local=%{http_code}\n" http://127.0.0.1:8188/
```

返回 `local=200` 就对了。不是 200 就看日志：

```bash
tail -n 50 /content/comfyui.log
```

### 4.2 开一条临时隧道

ComfyUI 只监听 `127.0.0.1`，浏览器在本地，直接访问不到。用 cloudflared 开一条临时 HTTPS 隧道：

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

nohup cloudflared tunnel --protocol http2 --edge-ip-version 4 --no-autoupdate \
  --url http://127.0.0.1:8188 > /content/cloudflared.log 2>&1 &

sleep 12
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /content/cloudflared.log | tail -1
```

把最后打印的地址粘到浏览器。这个地址是临时的，每次重启隧道都会变。

### 4.3 如果隧道很慢

先分清慢在哪一段：

```bash
curl -s -o /dev/null -w "local=%{http_code} %{time_total}s\n" http://127.0.0.1:8188/
curl -s -o /dev/null -w "tunnel=%{http_code} %{time_total}s\n" https://你的地址/system_stats
```

- `local` 不是 200：ComfyUI 没起来，看 `/content/comfyui.log`；
- `local` 快、`tunnel` 慢：换一条隧道，或者换 `--protocol` / `--edge-ip-version` 再试；
- 两个都快、浏览器慢：本地到 Cloudflare 的线路问题，换网络或代理模式。

一个会话只有一条 SSH 连接，ColabDesk 已经占着它；所以 `ssh -L` 转发通常连不上，隧道是更省事的方式。

## 5. 生成第一张图

### 5.1 打开官方模板

在 ComfyUI 左侧边栏打开 **Workflows → Browse Templates**（或顶部 **Workflow → Browse Templates**），搜索并打开 **MiniMax H3: Text to Image**。

画布上只有一小段节点链。模板已经连好线；第一次只需要确认 `ComfySwitchNode` 在 turbo 一侧、`steps` 是 8。

### 5.2 认识画布上的控件

| 控件 | 含义 | 第一次建议 |
| --- | --- | --- |
| `CLIP Text Encode` 的 `text` | 提示词 | 先换成你要画的内容 |
| `EmptyLatentImage` 的 `width` / `height` | 分辨率 | 保持 `1344 × 768`（16:9） |
| `ComfySwitchNode` | 基础模型 / turbo LoRA 的切换 | 切到 turbo 一侧，先跑快的那条 |
| `BasicScheduler` 的 `steps` | 采样步数 | turbo 用 `8`，基础模型用 `30` |
| `noise_seed` | 随机种子 | 先不动；比较提示词时再固定 |
| `SaveImage` 的 `filename_prefix` | 输出文件名前缀 | 默认 `image_minimax_h3_t2i` |

`ComfySwitchNode` 是模板里最容易看错的控件：一边是基础模型，一边接 8 步 turbo LoRA。切到 turbo 之后，`steps` 要同步改成 8；只改步数、不接 LoRA，画面会充满噪点。

### 5.3 点 Queue，等它出图

点 **Queue**。第一次运行会把约 41GB 权重读进显存，可能多等几十秒到几分钟；之后每次采样就快了。

本次在 G4 上实测：`1344 × 768`、turbo LoRA、8 步，**12.97 秒**出图，显存约 **59GB**。另开一个终端看显存：

```bash
nvidia-smi -l 2
```

出图后，文件在：

```
/content/ComfyUI/output/image/
```

是一张 1344×768 的 PNG。下面是这次实测的输出，提示词是「一只红熊猫，头顶停着一只黑鸟，背景是瀑布和枯山水庭院」：

![图 3 · 1344×768、8 步 turbo、12.97 秒的实测输出](/assets/blog/minimax-h3-image/example.png)

第一次不用追求完美，先确认三件事：图能打开、尺寸对、没有报错。这三件事成立，再改提示词和分辨率。

## 6. 提示词怎么写才不浪费一次生成

### 6.1 四段结构

生图提示词不需要时间轴和声音，但需要把画面说清楚。一段可用的提示词通常有四部分：

1. **主体**：谁或什么，外观、材质、服装、关键道具；
2. **构图**：景别、视角、主体在画面中的位置；
3. **光线**：光源方向、色温、明暗对比；
4. **风格与约束**：写实/插画/胶片，以及不想要的东西。

### 6.2 一个可用的例子

把这段粘到 `CLIP Text Encode` 的 `text` 输入框里：

```text
A photograph of a red panda with a small black bird perched on its head.
A waterfall and a zen garden with a stone lantern in the background.
Soft daylight, shallow depth of field, detailed fur, natural colors,
calm and playful mood. No text, no watermark.
```

这段描述对应上面的实测图。英文提示词的稳定性通常更好；中文也可以，但主体和风格词尽量写具体。

### 6.3 几条经验

- **先固定种子，再改提示词**：同一个 `noise_seed` 下比较两次结果，才能看出是提示词变了还是随机性变了；
- **一次只改一个变量**：主体、构图、光线分开调，别一次换掉整段；
- **1MP 的图别塞太多小脸和文字**：模型在 1344×768 下对远景小脸和长文本不擅长，想要这些细节就先生成，再单独放大；
- **不想要的东西写成约束**：这个模板只有一段正向提示词，没有单独的负面输入；把 `no text, no watermark, no logo` 写进正向描述里；
- **turbo 和基础模型不是同一个东西**：turbo 8 步快，但细节和稳定性略弱；要更稳的结果，切回基础模型用 30 步，代价是时间；
- **图像提示词可以直接复用到视频**：把同一段描述放进视频模板，再补时间轴、镜头和声音，省一次重新构思。

## 7. 出问题先看这里

### 7.1 页面打不开，或者很慢

按 4.3 的命令分别测本地和隧道。先确认 `local=200`，再怀疑隧道。

### 7.2 CUDA out of memory

这套权重在 G4 上约占 59GB 显存，正常情况下不会 OOM。如果真的遇到：

```bash
nvidia-smi
```

确认没有别的进程占着显存；把 `EmptyLatentImage` 降到 `1024 × 576` 再试。40GB 的 A100 放不下这套组合，不要用 A100 替代 G4。

### 7.3 模型下载失败

- 401/403：仓库是公开的，一般不需要 token；如果用了镜像，确认镜像地址正确；
- 很慢或中断：aria2 支持断点续传，重新执行同一条命令即可；
- 文件大小不对：删掉重下，不要用半个文件去启动。

### 7.4 图是黑的、噪的，或者尺寸不对

- 黑图/噪点：先检查 `ComfySwitchNode` 和 `steps` 是否匹配。turbo 分支配 8 步，基础模型配 30 步；只改一个会出问题；
- 尺寸不对：看 `EmptyLatentImage` 的 `width` / `height`，以及 `VAEDecode` 后面有没有多余的缩放节点；
- 颜色异常：确认 VAE 用的是模板指向的 `minimax_h3_video_vae_fp16.safetensors`，不要和 int8 VAE 混用；
- 模型下拉框为空：文件不在对应的 `models/` 子目录，按第 2 节的表检查路径。

### 7.5 重启后一切消失

`/content` 是临时磁盘，停止会话就清空。这是 Colab 的行为，不是 ColabDesk 的缓存问题。下次重新执行 3.2 和 3.3；模型下载一次大约 3–10 分钟。

### 7.6 其他常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `torch.cuda.is_available()` 为 `False` | PyTorch 与显卡架构不匹配 | 重装 cu128 wheel |
| `no kernel image is available` | 同上 | 同上 |
| `python3 -m venv` 报 `ensurepip returned non-zero exit status 1` | Colab 的 Python 缺少 ensurepip | 按 3.2 用 `virtualenv` 创建 venv |
| 启动日志出现 `You need pytorch with cu130 or higher...` | ComfyUI 0.45 的优化算子需要 cu130；cu128 走降级路径 | 可忽略；想启用优化算子就重装 cu130 wheel |
| 模板里找不到 MiniMax | ComfyUI 太旧 | `cd /content/ComfyUI && git pull`，重启 |
| 第一次 Queue 很久没动静 | 正在把权重读进显存 | 等；用 `nvidia-smi` 看显存增长 |
| 申请 G4 一直返回 503 | Colab 后端暂时没有 G4 容量 | 换时段再试；不要用 40GB 的 A100 硬跑这套权重 |
| 本地 `ssh -L` 连不上 | 一个会话只有一条 SSH 连接，ColabDesk 已占用 | 关闭工作区后再连，或走隧道 |

## 8. 收尾：把图拿走，把算力关掉

1. 在 ColabDesk 文件面板进入 `/content/ComfyUI/output/image/`，下载 PNG。
2. 关闭隧道：

```bash
pkill -f cloudflared
```

3. 在 ColabDesk 里停止会话。

> 停止会话后 `/content` 清空，模型、ComfyUI 和没下载的图都不会保留。G4 按小时计费，生成完就停，别让它空转。

## 9. 接下来可以做什么

跑通文字生成图像后，同一套环境还能做：

- **换比例**：把 `EmptyLatentImage` 改成 `768 × 1344` 做竖图，或 `1024 × 1024` 做方图；模型按约 100 万像素训练，短边不要低于 768；
- **图生视频**：打开 **MiniMax H3: Image to Video**，把这张 PNG 接到首帧，补上时间轴和声音；
- **参考生视频**：打开 **MiniMax H3: Reference to Video**，用人物照片锁定长相；
- **更高分辨率**：先生成 1344×768，再单独做一次放大；
- **批量出图**：同一段提示词换 `noise_seed` 连续 Queue，挑一张再放大；需要自动化时，ComfyUI 的 `/prompt` API 可以直接提交同一张工作流。

模型和模板的完整列表在 ComfyUI 的 Template Library 和 [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)。

---

*本文基于 ComfyUI 0.45、MiniMax H3 官方模板和 Colab G4 实机验证。*

## 附录 A：从零到启动的完整命令

```bash
# 1. 安装 ComfyUI
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m pip install --upgrade virtualenv
python3 -m virtualenv venv
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
dl $B/vae/minimax_h3_video_vae_fp16.safetensors \
   models/vae/minimax_h3_video_vae_fp16.safetensors
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
