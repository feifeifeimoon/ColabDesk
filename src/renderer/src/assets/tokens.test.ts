import { describe, expect, it } from "vitest";
import css from "./tokens.css?raw";

function declarations(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[`--${match[1]}`] = match[2].trim();
  }
  return tokens;
}

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css is missing ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}" && --depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`tokens.css has an unterminated ${selector} block`);
}

const light = declarations(block(":root"));
const dark = declarations(block(':root[data-theme="dark"]'));

function channels(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : value;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [red, green, blue] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The ring is a translucent ink wash; what the eye sees is its composite over the surface. */
function composite(ink: string, surface: string, alpha: number): string {
  const inkChannels = channels(ink);
  const surfaceChannels = channels(surface);
  const mixed = inkChannels.map((channel, index) =>
    Math.round(channel * alpha + surfaceChannels[index] * (1 - alpha)),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const surfaces = ["--chrome", "--page", "--canvas", "--canvas-soft", "--canvas-soft-2"];

describe("token contrast floor", () => {
  // The audit's regression net: these are the values that shipped below AA.
  it("keeps mute readable on every light and dark surface", () => {
    for (const surface of surfaces) {
      expect(contrast(light["--mute"], light[surface]), `light ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark["--mute"], dark[surface]), `dark ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps text on an error fill readable in both polarities", () => {
    expect(contrast(light["--on-error"], light["--error"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--on-error"], dark["--error"])).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the focus ring at 3:1 on every surface", () => {
    const alpha = Number(light["--focus-ring"].match(/var\(--ink\)\s+(\d+)%/)?.[1]) / 100;
    expect(alpha).toBeGreaterThan(0);
    for (const surface of surfaces) {
      expect(
        contrast(composite(light["--ink"], light[surface], alpha), light[surface]),
        `light ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const surface of surfaces) {
      expect(
        contrast(composite(dark["--ink"], dark[surface], alpha), dark[surface]),
        `dark ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the dark hover fill visibly above the chrome", () => {
    // A well that collapses into chrome erases every hover and active fill on the frame.
    expect(contrast(dark["--canvas-soft"], dark["--chrome"]), "dark hover step").toBeGreaterThanOrEqual(1.1);
  });
});
