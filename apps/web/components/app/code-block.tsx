import { codeToHtml } from "shiki";
import { CopyButton } from "./copy-button";

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock = async ({ code, language }: CodeBlockProps) => {
  const lang = language ?? "typescript";

  let html: string;
  try {
    html = await codeToHtml(code, { lang, theme: "github-dark" });
  } catch {
    html = await codeToHtml(code, { lang: "text", theme: "github-dark" });
  }

  return (
    <div className="dark relative rounded-md bg-muted overflow-hidden">
      <CopyButton code={code} />
      <div
        className="overflow-x-auto text-sm font-mono [&>pre]:!bg-transparent [&>pre]:p-4 [&>pre]:m-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export { CodeBlock };
