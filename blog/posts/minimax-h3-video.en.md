---
title: Generate Sound-Enabled AI Video with ColabDesk + ComfyUI
description: From an empty G4 runtime to an MP4 with stereo audio — install ComfyUI, download the official MiniMax H3 weights, and generate your first clip.
date: 2026-11-10
tags: [tutorial, comfyui, minimax]
cover: /assets/blog/minimax-h3-video/cover-en.png
---

> A complete walkthrough for a first-time user: deploy ComfyUI and the open MiniMax H3 weights on a Colab G4 runtime, then generate a short MP4 with stereo audio.
>
> Verified with ComfyUI 0.44 and the official MiniMax H3 template. No local GPU is required.

| Item | Detail |
| --- | --- |
| Difficulty | Beginner — copy and paste |
| First run | 40–60 minutes, including 5–15 minutes of downloads |
| Hardware | Colab G4 (NVIDIA RTX PRO 6000 Blackwell, 96GB VRAM) |
| Disk | About 60GB (39GB of weights plus ComfyUI and dependencies) |
| Cost | G4 is about 8.9 CU/hour; use the live reading in ColabDesk's status bar |
| Output | 1344×768, 24fps, about 5 seconds, stereo audio, MP4 |

---

## What you will use

- **ColabDesk**: the desktop SSH console. It creates the runtime, opens the terminal, browses the files, and shows what the runtime is spending.
- **ComfyUI**: the node-based generation interface, served as a web page from the runtime.
- **MiniMax H3**: the open multimodal video model that generates picture and sound in one pass.
- **Colab G4**: the cloud GPU with 96GB of VRAM.

How the pieces connect:

![How ColabDesk, the Colab runtime, ComfyUI and the browser connect](/assets/blog/minimax-h3-video/pipeline.png)

> A Colab runtime has no public SSH port and does not expose arbitrary ports. Step 5 uses a temporary HTTPS tunnel to bring ComfyUI's page to your browser.

---

## Step 1: Create a G4 session

1. Open ColabDesk and sign in with your Google account.
2. Click **New Session**, choose **G4**, name the session (for example `minimax-h3`), and create it.
3. Wait for the status to become READY. The terminal opens at `/content`.

Confirm the hardware in the terminal:

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
free -g
df -h /content
```

You should see `NVIDIA RTX PRO 6000 Blackwell Server Edition` and about `96GB` of VRAM.

> **Note**: `/content` is temporary. Stopping the session removes ComfyUI and the models; the next run repeats steps 2 and 3. Download anything you want to keep before you stop the session.

<!-- 📷 screenshot: the New Session dialog with G4 selected -->

---

## Step 2: Install ComfyUI

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

Verify PyTorch and the GPU:

```bash
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Expected output:

```
2.11.0+cu128 True NVIDIA RTX PRO 6000 Blackwell Server Edition
```

If `cuda.is_available()` is `False`, or you see `no kernel image is available`, the PyTorch wheel does not match the GPU architecture — reinstall the cu128 build.

---

## Step 3: Download the models

This walkthrough needs five files, about **39GB** in total, all from the official `Comfy-Org/MiniMax-H3` repository.

| File | Size | Destination |
| --- | ---: | --- |
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 19.53 GB | `models/diffusion_models/` |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 14.61 GB | `models/text_encoders/` |
| `minimax_h3_video_vae_int8_convrot.safetensors` | 2.62 GB | `models/vae/` |
| `minimax_h3_audio_vae_fp32.safetensors` | 0.56 GB | `models/vae/` |
| `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 1.82 GB | `models/loras/` |

In the terminal:

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

All five files should be present, with the sizes above.

> **Slow HuggingFace?** Replace `https://huggingface.co` with `https://hf-mirror.com` in the commands; nothing else changes.
>
> **Not a Blackwell GPU?** Use `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` (25.28GB) as the text encoder and select it in the template's model dropdown in step 6. NVFP4 weights require Blackwell.

---

## Step 4: Start ComfyUI

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

- `--highvram` keeps the weights on the GPU; use it on a 96GB card.
- `nohup ... &` detaches ComfyUI from the terminal. Closing the tab or disconnecting ColabDesk does not stop it.

If `ready` never appears, read the log:

```bash
tail -50 /content/comfyui.log
```

---

## Step 5: Open the interface in your browser

Colab has no fixed public IP and exposes one SSH channel. The simplest route is a temporary HTTPS tunnel started inside the runtime:

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

Under normal conditions this is below 0.3 seconds. If it takes seconds:

- run `pkill -f cloudflared` and the startup command again to land on another edge;
- if it stays slow, use the SSH forwarding option below.

> **Security**: a quick tunnel URL is public. Anyone with the link can operate your ComfyUI. Do not share it, and run `pkill -f cloudflared` when you are done.

### Alternative: SSH forwarding

If the tunnel latency stays high, let a local `ssh` forward the port. The cost is that this connection occupies the runtime's only SSH channel, so ColabDesk cannot connect while it is open:

1. Close the ColabDesk workspace for this session (this releases its SSH connection).
2. On your computer, use the alias ColabDesk generated:

```bash
ssh -N -L 8188:127.0.0.1:8188 colabdesk-your-session-name
```

3. Open `http://127.0.0.1:8188`.

<!-- 📷 screenshot: the ComfyUI home page / Template Library -->

---

## Step 6: Generate the first clip

1. In ComfyUI's left sidebar, open **Workflows → Browse Templates** (or **Workflow → Browse Templates** in the top menu).
2. Search for and open **MiniMax H3: Text to Video**.
3. The canvas shows a large **Image to Video (MiniMax H3)** node. Its outer controls are:
   - `prompt`: the description;
   - `width / height`: resolution, default `1344 × 768`;
   - seconds: duration, default `5` (the interface snaps it to a frame count the model accepts);
   - `noise_seed`: the random seed.
4. Confirm the five model dropdowns point at the files from step 3. If the template popup reports missing models, use its **Download** button instead.

The graph behind the template looks like this; you do not need to change a link on the first run:

![The ComfyUI MiniMax H3 text-to-video graph](/assets/blog/minimax-h3-video/workflow.png)

5. Click **Queue**.

The first run loads about 39GB of weights into VRAM; the progress bar may sit still for tens of seconds. That is expected.

The result lands here:

```
/content/ComfyUI/output/video/MiniMax_H3_*.mp4
```

The file already carries a stereo audio track and plays directly.

<!-- 📷 screenshot: the finished SaveVideo node and the output file -->

---

## Step 7: Write a prompt that works

MiniMax H3 responds best to a structured description. A usable prompt has five parts:

1. **Scene and subject**: place, people, clothing, key props.
2. **Action and timeline**: mark what happens in each beat with `[0s-2s]`, `[2s-4s]`.
3. **Camera**: static, push-in, pan, tracking.
4. **Light and texture**: source, colour temperature, film or realistic look.
5. **Sound**: ambience, Foley, music or dialogue.

Example:

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

A few habits:

- English prompts are usually more stable than Chinese ones;
- shorter clips finish their motion more reliably — one or two actions in five seconds;
- if you do not want text in the picture, say `no subtitles, no text, no watermarks`;
- for a specific move, write the full **type + amplitude + speed**, for example `pushes in with small amplitude at slow speed`.

---

## Step 8: Collect the result and clean up

1. In ColabDesk's file panel, open `/content/ComfyUI/output/video/` and download the MP4.
2. Stop the tunnel:

```bash
pkill -f cloudflared
```

3. Stop the session in ColabDesk.

> Stopping the session clears `/content`. The models, ComfyUI and any clip you did not download are gone.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Local `ssh -L` cannot connect | The runtime accepts one SSH connection and ColabDesk holds it | Close the ColabDesk workspace first, or use the HTTPS tunnel |
| The tunnel opens but the page is very slow | High latency to the Cloudflare edge | Restart with `--protocol http2 --edge-ip-version 4`, or use SSH forwarding |
| The page spins while the log looks healthy | Large frontend assets on a slow first load | Wait 1–2 minutes; check the Network tab for the stalled request |
| `CUDA out of memory` | Resolution or duration too high | Drop to `1024×576`, or shorten the clip to `3` seconds |
| `torch.cuda.is_available()` is `False` | PyTorch does not match the GPU | Reinstall the cu128 wheel |
| `no kernel image is available` | Same as above | Same as above |
| MiniMax templates are missing | ComfyUI is too old | `cd /content/ComfyUI && git pull`, then restart |
| The model dropdowns are empty | Files are not in the right `models/` subdirectory | Check the paths in step 3 |
| The first Queue seems stuck | 39GB of weights are loading into VRAM | Wait; watch VRAM with `nvidia-smi` |
| The output has no audio | The audio VAE is not loaded | Check `minimax_h3_audio_vae_fp32` and the `VAEDecodeAudio` link |
| Everything disappears after a restart | `/content` is temporary | Repeat steps 2 and 3, or mount Google Drive to keep the weights |

---

## Where to go next

Once text-to-video works, the same environment covers:

- **Image to video**: open **MiniMax H3: Image to Video** and connect a first frame.
- **Reference to video**: open **MiniMax H3: Reference to Video** and lock a character with photos.
- **Longer, multi-shot pieces**: generate several 5–8 second clips and join them in an editor.
- **Higher resolution**: generate at 768p first, then run a separate upscale pass for 2K.

The full model and template list is in ComfyUI's Template Library and [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3).

---

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

---

*Verified on a Colab G4 with ComfyUI 0.44 and the official MiniMax H3 templates.*
