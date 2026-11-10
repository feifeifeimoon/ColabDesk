/**
 * The blog's one interaction: a copy button on every highlighted code block.
 *
 * The site's CSP allows external scripts only, so the button is created here
 * rather than written into the generated HTML; the highlighter itself runs at
 * build time and ships as classes, not JavaScript.
 */

const labels =
  document.documentElement.lang === "zh-CN"
    ? { copy: "复制", copied: "已复制" }
    : { copy: "Copy", copied: "Copied" };

for (const block of document.querySelectorAll(".code-block")) {
  const code = block.querySelector("code");
  if (!code) continue;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-block__copy";
  button.textContent = labels.copy;

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.innerText);
      button.textContent = labels.copied;
      window.setTimeout(() => {
        button.textContent = labels.copy;
      }, 1400);
    } catch {
      // Clipboard permission can be denied; leave the label unchanged.
    }
  });

  block.append(button);
}
