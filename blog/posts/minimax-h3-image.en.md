---
title: Generate AI Images with ColabDesk + ComfyUI (MiniMax H3)
description: From an empty G4 session to a 1344×768 PNG — install ComfyUI, download the official MiniMax H3 weights, and generate your first image.
date: 2026-11-13
category: Tutorial
tags: [tutorial, comfyui, minimax]
cover: /assets/blog/minimax-h3-image/cover-en.png
---

> You have a Colab G4 and want one good image from a sentence, but you do not want to build the full video workflow first.
>
> This guide does one thing: start from an empty G4 session, install ComfyUI and the official MiniMax H3 weights, and produce a first 1344×768 PNG. Every step has a command you can paste, plus what you should see when it worked.

MiniMax H3 is a 33-billion-parameter omni-modal model. It is best known for generating video with sound, but the same weights can also produce a single frame: ComfyUI's **MiniMax H3: Text to Image** template folds the model's joint audio-video modelling into one sampling pass and outputs a still image. There is no audio and no timeline, so it is much faster than the video template — a good place to tune a prompt, a composition and a lighting setup before you reuse them for video.

ComfyUI is the node-based interface that wires the model, sampler and decoders into a graph. ColabDesk is the desktop console for the Colab session: it creates the G4, opens a real terminal, browses the files and shows what the session is spending. Together they need no local GPU.

This guide covers:

- What each node in the text-to-image template does;
- Why a 96GB G4 is enough;
- How to create the session, install ComfyUI and download about 41GB of weights;
- How to bring ComfyUI's interface to your browser;
- How to generate the first image and write a prompt;
- What to check when something goes wrong, and how to clean up.

| Item | Detail |
| --- | --- |
| You need | A Colab account that can allocate G4, and ColabDesk signed in |
| Hardware | Colab G4 (RTX PRO 6000 Blackwell, 96GB VRAM) |
| Disk | About 60GB: 41GB of weights plus ComfyUI and dependencies |
| First run | 30–40 minutes, including 3–10 minutes of downloads |
| Cost | G4 is about 8.9 compute units per hour (Colab's billing unit); use the live reading in ColabDesk's status bar |
| Output | One 1344×768 PNG, about 1.4MB in this test |

---

## 1. What each piece does (the one-minute version)

![Figure 1 · ColabDesk reaches the Colab session over SSH; ComfyUI reaches the browser through a temporary HTTPS tunnel](/assets/blog/minimax-h3-image/pipeline.png)

There are four roles, and they are easier to understand separately:

- **ColabDesk**: the desktop SSH console. It creates the G4 session, gives you a real terminal and a file panel, and shows what the session is spending.
- **Colab G4**: the cloud GPU with 96GB of VRAM. It runs ComfyUI and the weights; `/content` is wiped when the session stops.
- **ComfyUI**: the node-based interface served as a web page from the session. It listens only on `127.0.0.1:8188`.
- **MiniMax H3**: the model that actually generates the image.

The text-to-image template does not generate video or sound. It encodes the prompt into a representation the model can read, starts from noise in the model's compressed internal representation (the latent space), and decodes only the picture back to pixels. One sampling pass produces one frame, so there is no consistency problem between frames — and the result is much faster.

The price is still VRAM. Even after pruning and quantization, the 33-billion-parameter model is about 41GB of weights; sampling activations sit on top of that. In this test a 1344×768 image used about 59GB of VRAM, leaving comfortable headroom on the G4's 96GB. A 24GB or 48GB card spends its time swapping weights in and out, which is too slow to iterate.

## 2. Four files are enough

This minimal text-to-image workflow does one thing — text to image — and leaves out image-to-image, upscaling and multi-image consistency. It needs four files:

| File | Role | Size (GB) |
| --- | --- | ---: |
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | Diffusion model; produces the picture | 19.53 |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | Text encoder; turns the prompt into something the model can read | 14.61 |
| `minimax_h3_video_vae_fp16.safetensors` | Video decoder (VAE); turns the model's internal representation into pixels | 4.85 |
| `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | Acceleration LoRA (a small set of extra weights); lets the sampler use 8 steps | 1.82 |

About 41GB in total, all from the official `Comfy-Org/MiniMax-H3` repository.

ComfyUI's template wires them into a graph. The text-to-image template is much shorter than the video one:

![Figure 2 · The text-to-image graph: prompt and empty canvas → sampler → picture latent → PNG](/assets/blog/minimax-h3-image/workflow.png)

Four things in this graph are worth remembering:

- The **prompt** lives in the `CLIP Text Encode` node;
- The **resolution** lives on `EmptyLatentImage`; the template starts at `1344 × 768`;
- The **sampler** uses `res_multistep`. With the turbo LoRA, 8 steps are enough; without it, the base model wants 30;
- **`LTXVSeparateAVLatent` pulls the picture part out**, and `VAEDecode` turns it into a PNG. The image template does not decode audio, so there is no sound.

The `minimax_h3_video_vae_fp16.safetensors` filename says `video` because it is the video model's VAE; the image template simply uses it to decode one frame. Do not swap in an int8 VAE: the template points at the fp16 file, so keep them matched until the pipeline is working, then experiment.

## 3. Set up the session and ComfyUI

### 3.1 Create the G4 session

1. Open ColabDesk and sign in with your Google account.
2. Click **New Session**, choose **G4** as the accelerator, name it (for example `minimax-image`) and create it.
3. Wait for the status to become READY. The terminal opens in `/content`.

Confirm the hardware in the terminal:

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
```

You should see something like:

```
NVIDIA RTX PRO 6000 Blackwell Server Edition, 97887 MiB
```

### 3.2 Install ComfyUI

In the ColabDesk terminal:

```bash
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Colab's Python may not ship ensurepip; virtualenv bundles its own pip.
python3 -m pip install --upgrade virtualenv
python3 -m virtualenv venv
source venv/bin/activate
pip install -U pip

# Blackwell needs a CUDA 12.8+ PyTorch wheel
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

> **If `python3 -m venv venv` fails with `ensurepip returned non-zero exit status 1`**: that is a known Colab image problem, not a typo in the command. The `virtualenv` route above bundles pip and skips ensurepip.

Confirm that PyTorch sees the GPU:

```bash
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

You should see something like:

```
2.11.0+cu128 True NVIDIA RTX PRO 6000 Blackwell Server Edition
```

If `cuda.is_available()` is `False`, or you see `no kernel image is available`, the wheel does not match the GPU architecture. Reinstall the cu128 build and do not continue.

### 3.3 Download the models

In the same terminal:

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

Check the result:

```bash
find models -name "*.safetensors" -printf "%10s  %p\n" | sort -n
```

All four files should be there, with the sizes from the table in section 2.

> **Slow HuggingFace access**: if the direct connection is slow, replace `https://huggingface.co` with `https://hf-mirror.com`; nothing else changes.
>
> **Not a Blackwell card**: use `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` (25.28GB) as the text encoder. That brings the total to about 51GB, which does not fit a 40GB A100; get the pipeline working on a G4 before changing hardware.

## 4. Bring the interface to the browser

### 4.1 Start ComfyUI

```bash
cd /content/ComfyUI
source venv/bin/activate
nohup python main.py --listen 127.0.0.1 --port 8188 --highvram --disable-mmap \
  > /content/comfyui.log 2>&1 &
```

`--highvram` keeps the weights in VRAM as much as possible, and `--disable-mmap` avoids Colab's disk mapping slowing the first load.

Wait a few seconds and check that it answers locally:

```bash
curl -s -o /dev/null -w "local=%{http_code}\n" http://127.0.0.1:8188/
```

`local=200` means it is up. If not, read the log:

```bash
tail -n 50 /content/comfyui.log
```

### 4.2 Open a temporary tunnel

ComfyUI listens only on `127.0.0.1`, so the browser on your machine cannot reach it directly. Open a temporary HTTPS tunnel with cloudflared:

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

nohup cloudflared tunnel --protocol http2 --edge-ip-version 4 --no-autoupdate \
  --url http://127.0.0.1:8188 > /content/cloudflared.log 2>&1 &

sleep 12
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /content/cloudflared.log | tail -1
```

Paste the printed address into your browser. It is temporary and changes every time the tunnel restarts.

### 4.3 If the tunnel is slow

First find out which hop is slow:

```bash
curl -s -o /dev/null -w "local=%{http_code} %{time_total}s\n" http://127.0.0.1:8188/
curl -s -o /dev/null -w "tunnel=%{http_code} %{time_total}s\n" https://your-address/system_stats
```

- `local` is not 200: ComfyUI is not running; read `/content/comfyui.log`;
- `local` is fast and `tunnel` is slow: start another tunnel, or try a different `--protocol` / `--edge-ip-version`;
- both are fast but the browser is slow: the route from your machine to Cloudflare; change networks or proxy mode.

A session has a single SSH connection and ColabDesk already holds it, so `ssh -L` forwarding usually cannot connect. The tunnel is the simpler route.

## 5. Generate the first image

### 5.1 Open the official template

In ComfyUI's left sidebar open **Workflows → Browse Templates** (or **Workflow → Browse Templates** at the top), search for **MiniMax H3: Text to Image**, and open it.

The canvas holds a short graph. The template is already wired; for the first run, just confirm `ComfySwitchNode` is on the turbo side and `steps` is 8.

### 5.2 Know the controls

| Control | Meaning | First run |
| --- | --- | --- |
| `CLIP Text Encode` → `text` | The prompt | Replace it with what you want to draw |
| `EmptyLatentImage` → `width` / `height` | Resolution | Keep `1344 × 768` (16:9) |
| `ComfySwitchNode` | Base model / turbo LoRA switch | Switch to the turbo side and run the fast path |
| `BasicScheduler` → `steps` | Sampling steps | `8` with turbo, `30` with the base model |
| `noise_seed` | Random seed | Leave it alone; fix it when comparing prompts |
| `SaveImage` → `filename_prefix` | Output filename prefix | Default `image_minimax_h3_t2i` |

`ComfySwitchNode` is the one control that is easy to misread: one side is the base model, the other adds the 8-step turbo LoRA. After switching to turbo, change `steps` to 8. Changing the step count without connecting the LoRA produces a noisy image.

### 5.3 Queue it and wait

Click **Queue**. The first run loads about 41GB of weights into VRAM, which can take anything from tens of seconds to a few minutes; later runs are much faster.

In this test on a G4: `1344 × 768`, turbo LoRA, 8 steps, **12.97 seconds**, about **59GB** of VRAM. Watch it from another terminal:

```bash
nvidia-smi -l 2
```

The file lands in:

```
/content/ComfyUI/output/image/
```

It is one 1344×768 PNG. This is the output from the test run, prompted with "a red panda with a black bird perched on its head, in front of a waterfall and a zen garden":

![Figure 3 · The test output: 1344×768, 8 turbo steps, 12.97 seconds](/assets/blog/minimax-h3-image/example.png)

The first image does not have to be perfect. Confirm three things: it opens, the dimensions are right, and there are no errors. Once those hold, start changing the prompt and the resolution.

## 6. Write a prompt that does not waste a generation

### 6.1 The four-part structure

An image prompt does not need a timeline or a soundtrack, but it does need the picture spelled out. A usable prompt usually has four parts:

1. **Subject**: who or what, its appearance, material, clothing and key props;
2. **Composition**: shot size, angle and where the subject sits in the frame;
3. **Light**: direction, colour temperature and contrast;
4. **Style and constraints**: photographic, illustration or film, plus what you do not want.

### 6.2 A usable example

Paste this into the `CLIP Text Encode` node's `text` field:

```text
A photograph of a red panda with a small black bird perched on its head.
A waterfall and a zen garden with a stone lantern in the background.
Soft daylight, shallow depth of field, detailed fur, natural colors,
calm and playful mood. No text, no watermark.
```

This describes the test image above. English prompts are usually more stable; Chinese works too, but keep the subject and style words concrete.

### 6.3 A few habits

- **Fix the seed before changing the prompt**: with the same `noise_seed`, two results differ because of the prompt, not because of randomness;
- **Change one variable at a time**: subject, composition and light separately, not the whole paragraph at once;
- **Do not pack tiny faces or long text into a 1MP image**: at 1344×768 the model struggles with distant faces and long strings; generate first, then upscale;
- **Write constraints as positive text**: this template has one positive prompt and no separate negative input, so put `no text, no watermark, no logo` in the description;
- **Turbo and the base model are not the same**: turbo at 8 steps is fast but slightly less detailed and stable; switch back to the base model at 30 steps when you need a cleaner result, and pay with time;
- **Reuse the prompt for video**: drop the same description into the video template, then add a timeline, camera moves and audio instead of starting over.

## 7. What to check when something goes wrong

### 7.1 The page will not open, or is very slow

Run the two commands in section 4.3 and check local before blaming the tunnel.

### 7.2 CUDA out of memory

This set uses about 59GB of VRAM on a G4, so it should not run out. If it does:

```bash
nvidia-smi
```

Make sure no other process is holding memory, and lower `EmptyLatentImage` to `1024 × 576`. A 40GB A100 cannot hold this combination; do not substitute one for the G4.

### 7.3 The model download fails

- 401/403: the repository is public and normally needs no token; if you used a mirror, check its address;
- Slow or interrupted: aria2 resumes, so run the same command again;
- Wrong file size: delete and download again; do not start from half a file.

### 7.4 The image is black, noisy, or the wrong size

- Black or noisy: check that `ComfySwitchNode` and `steps` agree. The turbo side needs 8 steps; the base model needs 30. Changing only one produces a bad image;
- Wrong size: check `EmptyLatentImage`'s `width` / `height`, and look for an extra resize node after `VAEDecode`;
- Wrong colours: make sure the VAE is the template's `minimax_h3_video_vae_fp16.safetensors`, not an int8 VAE;
- Empty model dropdown: the file is not in the matching `models/` subdirectory; check the paths in section 2.

### 7.5 Everything disappeared after a restart

`/content` is temporary storage and is wiped when the session stops. That is Colab's behaviour, not a ColabDesk cache problem. Run sections 3.2 and 3.3 again next time; the download takes about 3–10 minutes.

### 7.6 Other common errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| `torch.cuda.is_available()` is `False` | PyTorch does not match the GPU architecture | Reinstall the cu128 wheel |
| `no kernel image is available` | Same | Same |
| `python3 -m venv` reports `ensurepip returned non-zero exit status 1` | Colab's Python lacks ensurepip | Create the venv with `virtualenv` as in 3.2 |
| The startup log says `You need pytorch with cu130 or higher...` | ComfyUI 0.45's optimized kernels want cu130; cu128 takes the fallback path | Ignore it, or reinstall the cu130 wheel to enable the optimized kernels |
| MiniMax is missing from the templates | ComfyUI is too old | `cd /content/ComfyUI && git pull`, then restart |
| The first Queue sits there for a long time | Weights are being loaded into VRAM | Wait; watch VRAM grow with `nvidia-smi` |
| G4 allocation keeps returning 503 | The Colab backend has no G4 capacity right now | Try another time; do not force this set onto a 40GB A100 |
| Local `ssh -L` cannot connect | A session has one SSH connection and ColabDesk holds it | Close the workspace first, or use the tunnel |

## 8. Clean up: take the image, stop the meter

1. In ColabDesk's file panel, open `/content/ComfyUI/output/image/` and download the PNG.
2. Close the tunnel:

```bash
pkill -f cloudflared
```

3. Stop the session in ColabDesk.

> Stopping the session wipes `/content`: the models, ComfyUI and any image you did not download are gone. G4 bills by the hour, so stop it when you are done instead of leaving it idle.

## 9. Where to go next

Once text-to-image works, the same environment can also do:

- **Other aspect ratios**: change `EmptyLatentImage` to `768 × 1344` for portrait or `1024 × 1024` for square. The model is trained around one megapixel, so keep the short edge at 768 or above;
- **Image to video**: open **MiniMax H3: Image to Video**, connect this PNG as the first frame, and add a timeline and audio;
- **Reference to video**: open **MiniMax H3: Reference to Video** to lock a person's face with a photo;
- **Higher resolution**: generate at 1344×768, then run a separate upscale pass;
- **Batches**: queue the same prompt with different `noise_seed` values and pick one to upscale; for automation, ComfyUI's `/prompt` API can submit the same graph directly.

The full list of models and templates is in ComfyUI's Template Library and [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3).

---

*Verified on ComfyUI 0.45, the official MiniMax H3 templates and a Colab G4.*

## Appendix A: every command, start to finish

```bash
# 1. Install ComfyUI
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m pip install --upgrade virtualenv
python3 -m virtualenv venv
source venv/bin/activate
pip install -U pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt

# 2. Download the models
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

# 3. Start
nohup python main.py --listen 127.0.0.1 --port 8188 --highvram --disable-mmap \
  > /content/comfyui.log 2>&1 &

# 4. Tunnel
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
nohup cloudflared tunnel --protocol http2 --edge-ip-version 4 --no-autoupdate \
  --url http://127.0.0.1:8188 > /content/cloudflared.log 2>&1 &
sleep 12
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /content/cloudflared.log | tail -1
```

## Appendix B: usage notes

- ColabDesk is a third-party tool and is not affiliated with Google; available accelerators and quotas depend on your account.
- MiniMax H3 is released as open weights; check the model publisher's and Comfy's terms for commercial use.
- Using and sharing generated content must follow local law and platform rules.
