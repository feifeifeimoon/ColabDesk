---
title: Generate Sound-Enabled AI Video with ColabDesk + ComfyUI
description: From an empty G4 runtime to an MP4 with stereo audio — install ComfyUI, download the official MiniMax H3 weights, and generate your first clip.
date: 2026-11-10
category: Tutorial
tags: [tutorial, comfyui, minimax]
cover: /assets/blog/minimax-h3-video/cover-en.png
---

> You have a Colab G4 and want a video with sound, but you do not want to read a full deployment manual first.
>
> This guide does one thing: start from an empty runtime, install ComfyUI and the official MiniMax H3 weights, and produce a first MP4 with stereo audio. Every step has a command you can paste, plus what you should see when it worked.

MiniMax H3 is a 33B omni-modal model: picture and sound are generated in the same diffusion process, so lip movement, room tone and action are aligned instead of being stitched together afterwards. The open weights target about one megapixel (768px short edge), 24fps and up to roughly 15 seconds. 2K is a hosted-service output; locally it needs a separate upscale pass.

ComfyUI is the node-based interface that wires the model, sampler and decoders into a graph. ColabDesk is the desktop console for the Colab runtime: it creates the G4, opens a real terminal, browses the files and shows what the runtime is spending. Together they need no local GPU.

This guide covers:

① What each piece in the workflow does;
② Why a 96GB G4 is enough;
③ How to create the runtime, install ComfyUI and download 39GB of weights;
④ How to bring ComfyUI's interface to your browser;
⑤ How to generate the first clip and write a prompt;
⑥ What to check when something goes wrong, and how to clean up.

| Item | Detail |
| --- | --- |
| You need | A Colab account that can allocate G4, and ColabDesk signed in |
| Hardware | Colab G4 (RTX PRO 6000 Blackwell, 96GB VRAM) |
| Disk | About 60GB: 39GB of weights plus ComfyUI and dependencies |
| First run | 40–60 minutes, including 5–15 minutes of downloads |
| Cost | G4 is about 8.9 CU/hour; use the live reading in ColabDesk's status bar |
| Output | 1344×768, 24fps, about 5 seconds, stereo audio, MP4 |

---

## 1. What each piece does (the one-minute version)

![Figure 1 · ColabDesk reaches the runtime over SSH; ComfyUI reaches the browser through a temporary HTTPS tunnel](/assets/blog/minimax-h3-video/pipeline.png)

There are four roles, and they are easier to understand separately:

- **ColabDesk**: the desktop SSH console. It creates the G4 session, gives you a real terminal and an SFTP file panel, and shows what the runtime is spending.
- **Colab G4**: the cloud GPU with 96GB of VRAM. It runs ComfyUI and the weights; `/content` is wiped when the session stops.
- **ComfyUI**: the node-based interface served as a web page from the runtime. It listens only on `127.0.0.1:8188`.
- **MiniMax H3**: the model that actually generates picture and sound.

MiniMax H3 does not produce a silent video and then dub it. It samples video and audio in one latent space, so speech, breathing, room tone and motion are computed together. That is why it sounds more natural than a video model with a separate voice pass.

The price is VRAM. Even after pruning and quantization, the 33B model is about 39GB of weights; add the sampling activations and a 24GB or 48GB card spends its time swapping weights in and out. The G4's 96GB is what makes this workflow comfortable, not a marketing number.

## 2. Five files are enough

This minimal workflow does one thing — text or image to video — and leaves out multi-person consistency, latent upscaling and multi-segment continuation. It needs five files:

| File | Role | Size (GB) |
| --- | --- | ---: |
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | Diffusion model; produces the picture | 19.53 |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | Text encoder; reads the prompt | 14.61 |
| `minimax_h3_video_vae_int8_convrot.safetensors` | Video VAE; latent space ↔ pixels | 2.62 |
| `minimax_h3_audio_vae_fp32.safetensors` | Audio VAE; latent space ↔ 32kHz stereo | 0.56 |
| `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | Step-distillation LoRA; lets the sampler use very few steps | 1.82 |

About 39GB in total, all from the official `Comfy-Org/MiniMax-H3` repository.

ComfyUI's template wires them into one graph. It looks roughly like this:

![Figure 2 · The template's graph: prompt → sampler → video and audio decode → MP4](/assets/blog/minimax-h3-video/workflow.png)

Only three things are worth remembering before you run it:

- **Prompt, resolution and duration** live on the `MiniMax H3 Image to Video` node;
- the **sampler** is `res_multistep`, and the template uses 4 steps;
- **video and audio each go through a VAE decode**, then `Create Video` muxes the MP4.

Duration is not arbitrary. The model generates on a 24fps frame grid, and valid lengths follow `17k + 5`; the interface snaps the seconds you type to the nearest legal value. Five seconds is 124 frames (5.17s), which is also the template default. You do not need to change it on the first run.

## 3. Set up the runtime and ComfyUI

### 3.1 Create the G4 session

1. Open ColabDesk and sign in with your Google account.
2. Click **New Session**, choose **G4**, name it (for example `minimax-h3`), and create it.
3. Wait for READY. The terminal opens at `/content`.

Confirm the hardware in the terminal:

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
free -g
df -h /content
```

You should see `NVIDIA RTX PRO 6000 Blackwell Server Edition` and about `96GB` of VRAM. Also look at system memory and free space on `/content`: the weights are 39GB, and ComfyUI plus outputs want another 20GB or so.

> **Note**: `/content` is temporary. Stopping the session removes ComfyUI and the weights; the next run repeats 3.2 and 3.3. Download anything you want to keep before you stop it.

### 3.2 Install ComfyUI

In the ColabDesk terminal:

```bash
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

python3 -m venv venv
source venv/bin/activate
pip install -U pip

# Blackwell needs a CUDA 12.8+ PyTorch wheel
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

Confirm that PyTorch can see the GPU:

```bash
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Expected output:

```
2.11.0+cu128 True NVIDIA RTX PRO 6000 Blackwell Server Edition
```

If `cuda.is_available()` is `False`, or you see `no kernel image is available`, the wheel does not match the GPU architecture. Reinstall the cu128 build; do not continue.

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

dl $B/vae/minimax_h3_video_vae_int8_convrot.safetensors \
   models/vae/minimax_h3_video_vae_int8_convrot.safetensors

dl $B/vae/minimax_h3_audio_vae_fp32.safetensors \
   models/vae/minimax_h3_audio_vae_fp32.safetensors

dl $B/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors \
   models/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors
```

Check the result:

```bash
find models -name "*.safetensors" -printf "%10s  %p\n" | sort -n
```

All five files should be present, with the sizes in the table in section 2.

> **Slow HuggingFace?** Replace `https://huggingface.co` with `https://hf-mirror.com` in the commands; nothing else changes.
>
> **Not a Blackwell GPU?** Use `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` (25.28GB) as the text encoder and select it in the template in section 5. NVFP4 requires Blackwell.

## 4. Bring the interface to the browser

### 4.1 Start ComfyUI

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

Wait for it to answer:

```bash
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8188/ || true)
  [ "$code" = "200" ] && echo "ComfyUI ready" && break
  sleep 2
done
```

Continue only after `ready`. If it never appears, read the log:

```bash
tail -50 /content/comfyui.log
```

Why these flags:

- `--listen 127.0.0.1`: listen locally only; the tunnel is the way in, not the public internet;
- `--highvram`: with 96GB, keep the weights resident instead of swapping them mid-sample;
- `nohup ... &`: detach from the terminal. Closing the tab or disconnecting ColabDesk does not stop generation.

### 4.2 Open a temporary tunnel

Colab has no fixed public IP and does not expose port 8188. The runtime has one SSH channel, and ColabDesk is using it. So do not reach for a local `ssh -L`; start an outbound HTTPS tunnel inside the runtime:

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

Copy the `https://....trycloudflare.com` address it prints and open it in your browser.

The first load may take a while. If the page never settles, measure the tunnel from the runtime:

```bash
curl -s -o /dev/null -w "total=%{time_total}s\n" https://your-address/system_stats
```

Under normal conditions this is below 0.3 seconds. If it takes seconds, restart the tunnel to land on another edge: `pkill -f cloudflared`, then run the startup command again. If it stays slow, use 4.3.

> **Security**: a quick tunnel URL is public. Anyone with the link can operate your ComfyUI. Do not share it, and run `pkill -f cloudflared` when you are done.

### 4.3 If the tunnel is slow: use SSH forwarding

If the tunnel latency stays high, let a local `ssh` forward the port. The cost is that this connection occupies the runtime's only SSH channel, so ColabDesk cannot connect while it is open:

1. Close the ColabDesk workspace for this session, which releases its SSH connection.
2. On your computer, use the alias ColabDesk generated:

```bash
ssh -N -L 8188:127.0.0.1:8188 colabdesk-your-session-name
```

3. Open `http://127.0.0.1:8188`.

ComfyUI was started with `nohup`, so it is unaffected. Press `Ctrl+C` when done; ColabDesk can then take the connection back.

## 5. Generate the first clip

### 5.1 Open the official template

In ComfyUI's left sidebar, open **Workflows → Browse Templates** (or **Workflow → Browse Templates** in the top menu), then search for and open **MiniMax H3: Text to Video**.

The canvas shows a large **Image to Video (MiniMax H3)** node. The template is already wired; you do not need to change a link on the first run.

### 5.2 Know the controls

The outer controls are:

| Control | Meaning | First run |
| --- | --- | --- |
| `prompt` | The description | Leave the template's example |
| `width` / `height` | Resolution | Keep `1344 × 768` |
| Seconds | Duration, snapped to a legal frame count | Keep `5` (124 frames) |
| `noise_seed` | Random seed | Leave it |
| Model dropdowns | The five weights | Confirm they point at section 2's files |

If the template popup reports missing models, use its **Download** button and confirm the dropdowns point at the same files afterwards.

### 5.3 Queue it and wait

Click **Queue**. The first run loads about 39GB of weights into VRAM; the progress bar may sit still for tens of seconds. That is expected. Watch VRAM from a second terminal:

```bash
watch -n 2 nvidia-smi
```

The result lands here:

```
/content/ComfyUI/output/video/MiniMax_H3_*.mp4
```

It carries a stereo audio track and plays directly. Do not aim for a perfect clip on the first run; confirm three things first: the picture moves, there is sound, and nothing errored. Once those hold, change the prompt and duration.

## 6. Write a prompt that does not waste a generation

### 6.1 The five-part structure

MiniMax H3 responds best to a structured description. A usable prompt has five parts:

1. **Scene and subject**: place, people, clothing, key props;
2. **Action and timeline**: mark each beat with `[0s-2s]`, `[2s-4s]`;
3. **Camera**: static, push-in, pan, tracking;
4. **Light and texture**: source, colour temperature, film or realistic look;
5. **Sound**: ambience, Foley, music or dialogue.

### 6.2 A usable example

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

### 6.3 A few habits

- English prompts are usually more stable than Chinese ones;
- one or two actions in five seconds; more motion is more likely to smear;
- if you do not want text in the picture, say `no subtitles, no text, no watermarks`;
- for a specific move, write the full **type + amplitude + speed**, for example `pushes in with small amplitude at slow speed`;
- sound is generated, not dubbed. The `Audio:` line changes the result; do not describe only the picture.

## 7. What to check when something goes wrong

### 7.1 The page will not open, or is very slow

First confirm ComfyUI itself is healthy:

```bash
curl -s -o /dev/null -w "local=%{http_code} %{time_total}s\n" http://127.0.0.1:8188/
curl -s -o /dev/null -w "tunnel=%{http_code} %{time_total}s\n" https://your-address/system_stats
```

- `local` is not 200: ComfyUI is not up; read `/content/comfyui.log`;
- `local` is fast and `tunnel` is slow: the tunnel path; restart it per 4.2, or use 4.3;
- both are fast and the browser is slow: your network to Cloudflare; switch networks or proxy mode and retry.

### 7.2 CUDA out of memory

Drop the resolution to `1024×576`, or the duration to `3` seconds. Check that nothing else is holding VRAM:

```bash
nvidia-smi
```

If it still OOMs, the session does not have enough VRAM or system memory; start a fresh G4 session.

### 7.3 The model download fails

- 401/403: the repository is public and normally needs no token; if you are using a mirror, check the address;
- slow or interrupted: aria2 resumes with `--continue`; run the same command again;
- wrong size: delete the file and download it again; do not start with half a model.

### 7.4 The output has no sound

Check that `minimax_h3_audio_vae_fp32.safetensors` is in `models/vae/`, and that `VAEDecodeAudio` in the template is connected to the audio VAE. The sound is generated by the model; no dubbing plugin is involved.

### 7.5 Everything disappeared after a restart

`/content` is temporary disk; stopping the session clears it. That is Colab's behaviour, not a ColabDesk cache. Repeat 3.2 and 3.3 next time; to save the download, put the weights on Google Drive and symlink them back into `models/`.

### 7.6 Other common errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| `torch.cuda.is_available()` is `False` | PyTorch does not match the GPU | Reinstall the cu128 wheel |
| `no kernel image is available` | Same as above | Same as above |
| MiniMax templates are missing | ComfyUI is too old | `cd /content/ComfyUI && git pull`, then restart |
| The model dropdowns are empty | Files are not in the right `models/` subdirectory | Check the paths in section 2 |
| The first Queue seems stuck | Weights are loading into VRAM | Wait; watch VRAM with `nvidia-smi` |
| Local `ssh -L` cannot connect | One SSH channel, held by ColabDesk | Close the workspace first, or use the tunnel |

## 8. Clean up: take the clip, stop the meter

1. In ColabDesk's file panel, open `/content/ComfyUI/output/video/` and download the MP4.
2. Stop the tunnel:

```bash
pkill -f cloudflared
```

3. Stop the session in ColabDesk.

> Stopping the session clears `/content`: the weights, ComfyUI and any clip you did not download are gone. G4 is billed by the hour; stop it when the generation is done.

## 9. Where to go next

Once text-to-video works, the same environment covers:

- **Image to video**: open **MiniMax H3: Image to Video** and connect a first frame;
- **Reference to video**: open **MiniMax H3: Reference to Video** and lock a character with photos;
- **Longer, multi-shot pieces**: generate several 5–8 second clips and join them in an editor;
- **Higher resolution**: generate at 768p first, then run a separate upscale pass;
- **Harder continuity**: multiple people in frame, cross-segment continuation, far-face refinement — another layer of capability; get the minimal version comfortable first.

The full model and template list is in ComfyUI's Template Library and [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3).

---

*Verified on a Colab G4 with ComfyUI 0.44 and the official MiniMax H3 templates.*

## Appendix A: every command, start to finish

```bash
# 1. Install ComfyUI
cd /content
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m venv venv
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
dl $B/vae/minimax_h3_video_vae_int8_convrot.safetensors \
   models/vae/minimax_h3_video_vae_int8_convrot.safetensors
dl $B/vae/minimax_h3_audio_vae_fp32.safetensors \
   models/vae/minimax_h3_audio_vae_fp32.safetensors
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

- ColabDesk is an unofficial tool and is not affiliated with Google. Available machine types and quota are determined by your Colab account.
- MiniMax H3 is released as open weights. Commercial use is governed by the model publisher's and Comfy's terms.
- Use and distribution of generated content must follow local law and platform rules.
