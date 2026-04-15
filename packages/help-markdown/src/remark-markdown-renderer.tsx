/**
 * Remark → React for translation helps (based on bt-synergy tc-study `remarkRenderer.tsx`).
 */

import { BookOpen, GraduationCap, Hash } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import * as prod from 'react/jsx-runtime';
import rehypeReact from 'rehype-react';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import type { Processor } from 'unified';
import { unified } from 'unified';

import { getRcLinkDisplayName, isRelativeLink, parseRcLink } from './rc-link-parser';
import { remarkRcLinks } from './remark-rc-links';

export interface RemarkMarkdownRendererOptions {
  allowDangerousHtml?: boolean;
  linkTarget?: '_blank' | '_self';
  headerBaseLevel?: number;
  customComponents?: Record<string, import('react').ComponentType<Record<string, unknown>>>;

  onInternalLinkClick?: (
    href: string,
    linkType: 'rc' | 'relative' | 'unknown',
    linkText?: string,
  ) => void;

  /** Full `rc://…` href → localized entry title (from title.md / TW H1), or null while loading / missing */
  getEntryTitle?: (rcHref: string) => string | null;
}

export class RemarkMarkdownRenderer {
  private processor: Processor | null = null;
  private options: RemarkMarkdownRendererOptions;

  constructor(options: RemarkMarkdownRendererOptions = {}) {
    this.options = {
      linkTarget: '_blank',
      headerBaseLevel: 3,
      allowDangerousHtml: false,
      ...options,
    };
    this.initializeProcessor();
  }

  private initializeProcessor() {
    if (this.processor) return this.processor;

    this.processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRcLinks)
      .use(remarkRehype, {
        allowDangerousHtml: this.options.allowDangerousHtml || false,
      })
      .use(rehypeReact, {
        Fragment,
        jsx: prod.jsx,
        jsxs: prod.jsxs,
        components: {
          a: (props: Record<string, unknown> & { href?: string; children?: unknown }) => {
            const href = props.href || '';

            const getLinkText = (): string => {
              const children = props.children;
              if (typeof children === 'string') return children;
              if (Array.isArray(children)) {
                return children.map((c) => (typeof c === 'string' ? c : '')).join('');
              }
              return '';
            };
            const linkText = getLinkText();

            if (href.startsWith('rc://')) {
              const parsed = parseRcLink(href);

              if (!parsed.isValid) {
                return (
                  <span className="text-muted-foreground cursor-not-allowed" title={`Invalid rc:// link: ${href}`}>
                    {(props.children as ReactNode) ?? null}
                  </span>
                );
              }

              const Icon =
                parsed.resourceType === 'academy'
                  ? GraduationCap
                  : parsed.resourceType === 'words'
                    ? Hash
                    : BookOpen;

              const colorClass =
                parsed.resourceType === 'academy'
                  ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/40'
                  : parsed.resourceType === 'words'
                    ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                    : 'text-green-600 hover:text-green-800 hover:bg-green-50 dark:hover:bg-green-950/40';

              let displayText = linkText;
              if (this.options.getEntryTitle) {
                const title = this.options.getEntryTitle(href);
                if (title) {
                  displayText = title;
                } else if (linkText === href || linkText.startsWith('rc://')) {
                  displayText = getRcLinkDisplayName(parsed);
                }
              } else if (linkText === href || linkText.startsWith('rc://')) {
                displayText = getRcLinkDisplayName(parsed);
              }

              return (
                <button
                  type="button"
                  onClick={() => this.options.onInternalLinkClick?.(href, 'rc', linkText)}
                  className={`inline-flex max-w-full flex-wrap items-center gap-1 whitespace-normal text-left ${colorClass} rounded px-1 py-0.5 text-sm font-medium transition-colors`}
                  title={`${parsed.resourceAbbrev.toUpperCase()}: ${parsed.entryId}`}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">{displayText}</span>
                </button>
              );
            }

            if (isRelativeLink(href)) {
              return (
                <button
                  type="button"
                  onClick={() => this.options.onInternalLinkClick?.(href, 'relative', linkText)}
                  className="inline-flex max-w-full flex-wrap items-center gap-1 whitespace-normal text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground rounded px-1 py-0.5 text-sm"
                  title={`Relative link: ${href}`}
                >
                  <BookOpen className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">{(props.children as ReactNode) ?? null}</span>
                </button>
              );
            }

            const { children: aChildren, href: _h, ...aRest } = props;
            return (
              <a
                {...(aRest as Record<string, unknown>)}
                href={href}
                target={this.options.linkTarget || '_blank'}
                rel={this.options.linkTarget === '_blank' ? 'noopener noreferrer' : undefined}
                className="text-primary min-w-0 max-w-full break-words hover:underline [overflow-wrap:anywhere]"
              >
                {(aChildren as ReactNode) ?? null}
              </a>
            );
          },
          h1: (props: Record<string, unknown>) => (
            <h1 {...props} className="mb-3 mt-4 min-w-0 max-w-full break-words text-lg font-bold first:mt-0 [overflow-wrap:anywhere]" />
          ),
          h2: (props: Record<string, unknown>) => (
            <h2 {...props} className="mb-2 mt-3 min-w-0 max-w-full break-words text-base font-semibold [overflow-wrap:anywhere]" />
          ),
          h3: (props: Record<string, unknown>) => (
            <h3 {...props} className="mb-2 mt-2 min-w-0 max-w-full break-words text-sm font-semibold [overflow-wrap:anywhere]" />
          ),
          h4: (props: Record<string, unknown>) => (
            <h4 {...props} className="mb-1 mt-2 min-w-0 max-w-full break-words text-sm font-semibold [overflow-wrap:anywhere]" />
          ),
          h5: (props: Record<string, unknown>) => (
            <h5 {...props} className="mb-1 mt-2 min-w-0 max-w-full break-words text-xs font-semibold [overflow-wrap:anywhere]" />
          ),
          h6: (props: Record<string, unknown>) => (
            <h6 {...props} className="mb-1 mt-2 min-w-0 max-w-full break-words text-xs font-semibold [overflow-wrap:anywhere]" />
          ),
          p: (props: Record<string, unknown>) => (
            <p {...props} className="mb-3 min-w-0 max-w-full break-words leading-relaxed last:mb-0 [overflow-wrap:anywhere]" />
          ),
          ul: (props: Record<string, unknown>) => (
            <ul {...props} className="mb-3 ml-5 min-w-0 max-w-full list-disc space-y-1 break-words [overflow-wrap:anywhere]" />
          ),
          ol: (props: Record<string, unknown>) => (
            <ol {...props} className="mb-3 ml-5 min-w-0 max-w-full list-decimal space-y-1 break-words [overflow-wrap:anywhere]" />
          ),
          li: (props: Record<string, unknown>) => (
            <li {...props} className="min-w-0 break-words leading-relaxed [overflow-wrap:anywhere]" />
          ),
          code: (props: Record<string, unknown> & { className?: string }) => {
            if (!props.className) {
              return (
                <code
                  {...props}
                  className="bg-muted text-foreground rounded px-1 py-0.5 text-[0.85em] font-mono"
                />
              );
            }
            return <code {...props} />;
          },
          pre: (props: Record<string, unknown>) => (
            <pre {...props} className="bg-muted mb-3 overflow-x-auto rounded-md p-3 text-xs" />
          ),
          blockquote: (props: Record<string, unknown>) => (
            <blockquote {...props} className="border-primary/30 mb-3 border-l-4 pl-3 italic text-muted-foreground" />
          ),
          strong: (props: Record<string, unknown>) => <strong {...props} className="font-semibold" />,
          em: (props: Record<string, unknown>) => <em {...props} className="italic" />,
          hr: (props: Record<string, unknown>) => <hr {...props} className="my-4 border-t border-border" />,
          table: (props: Record<string, unknown>) => (
            <div className="mb-3 overflow-x-auto">
              <table {...props} className="min-w-full border-collapse border border-border text-sm" />
            </div>
          ),
          thead: (props: Record<string, unknown>) => <thead {...props} className="bg-muted/60" />,
          tbody: (props: Record<string, unknown>) => <tbody {...props} />,
          tr: (props: Record<string, unknown>) => <tr {...props} className="border-b border-border" />,
          th: (props: Record<string, unknown>) => (
            <th {...props} className="border border-border px-2 py-1.5 text-left font-semibold" />
          ),
          td: (props: Record<string, unknown>) => <td {...props} className="border border-border px-2 py-1.5" />,
          ...this.options.customComponents,
        },
      });

    return this.processor;
  }

  updateOptions(newOptions: Partial<RemarkMarkdownRendererOptions>) {
    this.options = { ...this.options, ...newOptions };
    this.processor = null;
    this.initializeProcessor();
  }

  async renderToReact(content: string): Promise<ReactNode> {
    if (!content) return null;
    const preprocessedContent = this.preprocessContent(content);
    const processor = this.initializeProcessor();
    const file = await processor!.process(preprocessedContent);
    return file.result as ReactNode;
  }

  private preprocessContent(content: string): string {
    let processed = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\r/g, '\r')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    processed = processed.replace(/\[\[rc:\/\/([^\]]+)\]\]/g, '[rc://$1](rc://$1)');
    processed = processed.replace(/\[\[(\.\.[^\]]+)\]\]/g, '[$1]($1)');

    return processed;
  }
}
