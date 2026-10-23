/**
 * The rendered side of a Markdown file.
 *
 * `react-markdown` does not render raw HTML unless `rehype-raw` is added, and
 * it is deliberately not added: a runtime can hold a file this window has never
 * seen. GFM gives tables, task lists and autolinks. Links leave through the
 * main process, never by navigating this window; relative links are left inert
 * because there is no page they resolve against.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternal } from "../../lib/api";

const EXTERNAL = /^(https?:|mailto:)/i;

export function MarkdownPreview({ text }: { text: string }) {
  return (
    <div className="markdown-preview">
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children, title }) => {
              const external = typeof href === "string" && EXTERNAL.test(href);
              return (
                <a
                  href={href}
                  title={title}
                  onClick={(event) => {
                    event.preventDefault();
                    if (external) openExternal(href);
                  }}
                >
                  {children}
                </a>
              );
            },
            img: ({ src, alt, title }) => (
              <img
                src={typeof src === "string" ? src : undefined}
                alt={alt ?? ""}
                title={title}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
