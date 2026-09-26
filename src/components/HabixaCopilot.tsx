"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { supabase } from "@/lib/supabaseClient";
import type { LocalStore } from "@/lib/types";

type CopilotMessage = {
  content: string;
  id: string;
  role: "assistant" | "user";
};

type CopilotContext = {
  id?: string | null;
  type?: "property" | "unit" | "tenant" | "lease" | null;
};

const suggestions = [
  "Quels loyers sont en retard ?",
  "Quels baux expirent bientôt ?",
  "Quels logements sont vacants ?",
  "Résume mon portefeuille.",
];

export function HabixaCopilot() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { configured } = useAuth();
  const { data, dataMode, isSupabaseMode, loading: snapshotLoading } = usePortfolioSnapshot();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CopilotMessage[]>(() => [
    {
      content: "Bonjour, je peux répondre à vos questions sur votre portefeuille Nexbail.",
      id: createMessageId(),
      role: "assistant",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pendingRef = useRef(false);
  const context = useMemo(() => getPageContext(pathname, searchParams), [pathname, searchParams]);

  async function handleSubmit(question = input) {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setSending(true);
    setError(null);
    setInput("");

    const nextMessages: CopilotMessage[] = [
      ...messages,
      {
        content: trimmedQuestion,
        id: createMessageId(),
        role: "user",
      },
    ];
    setMessages(nextMessages);

    try {
      const answer = await askCopilot({
        context,
        dataMode,
        localSnapshot: !isSupabaseMode ? data : null,
        messages: nextMessages,
        supabaseConfigured: configured,
      });

      setMessages((current) => [
        ...current,
        {
          content: answer,
          id: createMessageId(),
          role: "assistant",
        },
      ]);
    } catch (requestError) {
      console.error("[Nexbail Copilot]", requestError);
      setError("Impossible de joindre Nexbail Copilot.");
    } finally {
      pendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <>
      <button
        aria-label="Ouvrir Nexbail Copilot"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--accent)]/45 bg-[color:var(--accent)] text-white shadow-[0_18px_44px_rgba(37,99,235,0.42)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(37,99,235,0.5)] sm:bottom-5 sm:right-5"
        onClick={() => setOpen(true)}
        type="button"
      >
        <AppIcon name="sparkles" size={22} />
      </button>

      {open ? (
        <section className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] top-2 z-[70] flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#081120] shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:inset-auto sm:bottom-5 sm:right-5 sm:max-h-[min(720px,calc(100dvh-2.5rem))] sm:w-[min(430px,calc(100vw-2rem))]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)]/18 text-[color:var(--accent)]">
                <AppIcon name="sparkles" size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-[var(--foreground)]">Nexbail Copilot</h2>
                <p className="truncate text-xs text-[var(--muted)]">{isSupabaseMode ? "Données Supabase sécurisées" : "Mode local / démo"}</p>
              </div>
            </div>
            <button
              aria-label="Fermer Nexbail Copilot"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-white/[0.06] hover:text-[var(--foreground)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              <AppIcon name="x" size={18} />
            </button>
          </header>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`min-w-0 max-w-[86%] break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-[color:var(--accent)] text-white"
                      : "border border-[var(--border)] bg-white/[0.04] text-[var(--foreground)]"
                  }`}
                >
                  {message.role === "assistant" ? <CopilotMarkdown content={message.content} /> : message.content}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-[var(--border)] bg-white/[0.04] px-3.5 py-2.5 text-sm text-[var(--muted)]">Analyse en cours...</div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--border)] px-4 py-3">
            {messages.length <= 1 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="rounded-full border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)]"
                    disabled={sending}
                    onClick={() => void handleSubmit(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
            {error ? <p className="mb-2 text-xs font-semibold text-red-300">{error}</p> : null}
            {isSupabaseMode && snapshotLoading ? <p className="mb-2 text-xs text-[var(--muted)]">Le portefeuille se charge; le Copilot vérifiera les données côté serveur.</p> : null}
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <textarea
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[#050b15] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[color:var(--accent)]"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder={getPlaceholder(context)}
                rows={1}
                value={input}
              />
              <button
                aria-label="Envoyer au Copilot"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)] text-white transition hover:bg-[color:var(--accent)]/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={sending || !input.trim()}
                type="submit"
              >
                <AppIcon name="send" size={17} />
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </>
  );
}

function CopilotMarkdown({ content }: { content: string }) {
  const blocks = parseCopilotMarkdown(normalizeMarkdownContent(content));

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "ul") {
          return (
            <ul key={`${block.type}-${index}`} className="ml-4 list-disc space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol key={`${block.type}-${index}`} className="ml-4 list-decimal space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "heading") {
          return (
            <p key={`${block.type}-${index}`} className="font-semibold text-[var(--foreground)]">
              {renderInlineMarkdown(block.text)}
            </p>
          );
        }

        if (block.type === "paragraph") {
          return <p key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</p>;
        }

        return null;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { items: string[]; type: "ol" | "ul" }
  | { text: string; type: "heading" | "paragraph" };

function normalizeMarkdownContent(content: string) {
  return content.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, "$1");
}

function parseCopilotMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  let listBlock: { items: string[]; type: "ol" | "ul" } | null = null;

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({ text: paragraphLines.join("\n").trim(), type: "paragraph" });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!listBlock) {
      return;
    }

    blocks.push(listBlock);
    listBlock = null;
  }

  content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((rawLine) => {
      const line = rawLine.trim();

      if (!line) {
        flushParagraph();
        flushList();
        return;
      }

      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);

      if (headingMatch) {
        flushParagraph();
        flushList();
        blocks.push({ text: headingMatch[1].trim(), type: "heading" });
        return;
      }

      const unorderedMatch = line.match(/^[-*]\s+(.+)$/);

      if (unorderedMatch) {
        flushParagraph();

        if (!listBlock || listBlock.type !== "ul") {
          flushList();
          listBlock = { items: [], type: "ul" };
        }

        listBlock.items.push(unorderedMatch[1].trim());
        return;
      }

      const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);

      if (orderedMatch) {
        flushParagraph();

        if (!listBlock || listBlock.type !== "ol") {
          flushList();
          listBlock = { items: [], type: "ol" };
        }

        listBlock.items.push(orderedMatch[1].trim());
        return;
      }

      flushList();
      paragraphLines.push(line);
    });

  flushParagraph();
  flushList();

  return blocks.length > 0 ? blocks : [{ text: content, type: "paragraph" }];
}

function renderInlineMarkdown(text: string) {
  return text.split("\n").flatMap((line, lineIndex, lines) => {
    const parts = line.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g);
    const renderedLine = parts.map((part, index) => {
      if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
        return (
          <strong key={`${part}-${lineIndex}-${index}`} className="font-semibold text-[var(--foreground)]">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
        return (
          <em key={`${part}-${lineIndex}-${index}`} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      return part;
    });

    if (lineIndex === lines.length - 1) {
      return renderedLine;
    }

    return [...renderedLine, <br key={`line-break-${lineIndex}`} />];
  });
}

async function askCopilot(input: {
  context: CopilotContext | null;
  dataMode: "local" | "supabase";
  localSnapshot: LocalStore | null;
  messages: CopilotMessage[];
  supabaseConfigured: boolean;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (input.supabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  const response = await fetch("/api/copilot", {
    body: JSON.stringify({
      context: input.context,
      dataMode: input.dataMode,
      localSnapshot: input.dataMode === "local" ? input.localSnapshot : null,
      messages: input.messages.map((message) => ({
        content: message.content,
        role: message.role,
      })),
    }),
    headers,
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || "Copilot request failed.");
  }

  return payload?.message || "Je n'ai pas trouvé de réponse avec les données disponibles.";
}

function getPageContext(pathname: string, searchParams: URLSearchParams): CopilotContext | null {
  const tenantId = searchParams.get("tenantId") || searchParams.get("tenant");
  const unitId = searchParams.get("unitId") || searchParams.get("unit");
  const leaseId = searchParams.get("leaseId") || searchParams.get("lease");

  if (tenantId) {
    return { id: tenantId, type: "tenant" };
  }

  if (unitId) {
    return { id: unitId, type: "unit" };
  }

  if (leaseId) {
    return { id: leaseId, type: "lease" };
  }

  const match = pathname.match(/^\/immeubles\/([^/?#]+)/);

  if (match?.[1]) {
    return { id: decodeURIComponent(match[1]), type: "property" };
  }

  return null;
}

function getPlaceholder(context: CopilotContext | null) {
  if (context?.type === "tenant") {
    return "Posez une question sur ce locataire...";
  }

  if (context?.type === "property") {
    return "Posez une question sur cet immeuble...";
  }

  if (context?.type === "unit") {
    return "Posez une question sur ce logement...";
  }

  if (context?.type === "lease") {
    return "Posez une question sur ce bail...";
  }

  return "Posez une question sur votre portefeuille...";
}

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `copilot-${crypto.randomUUID()}`;
  }

  return `copilot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
