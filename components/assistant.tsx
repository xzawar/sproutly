"use client";
/* eslint-disable react-hooks/set-state-in-effect -- restore this tab's conversation */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Sparkles, Square, SquarePen } from "lucide-react";
import { useGarden } from "./garden-provider";
import { useWeather } from "./weather";
import { buildGardenContext } from "@/lib/ai-context";

type Message = { role: "user" | "assistant"; content: string };

/** Tiny, safe markdown: paragraphs, bullet/numbered lists and **bold**. No HTML injection. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length}>{items}</ol>
      ) : (
        <ul key={blocks.length}>{items}</ul>
      ),
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      heading ? (
        <p key={blocks.length} className="md-heading">
          {inline(heading[1])}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <>{blocks}</>;
}

export function AssistantView() {
  const { data, today } = useGarden();
  const { weather, place } = useWeather();
  const key = `sproutly-chat:${data.profile.id}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* start fresh */
    }
  }, [key]);
  useEffect(() => {
    if (streaming) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(messages.slice(-30)));
    } catch {
      /* memory only */
    }
  }, [messages, streaming, key]);
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ block: "end" });
  }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  const plants = data.plants.filter((p) => !p.archived_at);
  const suggestions = useMemo(
    () =>
      [
        "What should I do in the garden today?",
        plants[0] && `Why might my ${plants[0].name}'s leaves turn yellow?`,
        weather
          ? "Can any watering wait because of the weather?"
          : "How often should I water in hot weather?",
        "Plan my care for the next 7 days.",
      ].filter(Boolean) as string[],
    [plants, weather],
  );

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setError("");
    const history: Message[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setStreaming(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-20),
          context: buildGardenContext(data, today, weather, place),
        }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) {
        const body = await r.json().catch(() => ({}));
        throw Error(body.error ?? "The assistant is unavailable right now.");
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: reply }]);
      }
      if (!reply.trim())
        setMessages([
          ...history,
          {
            role: "assistant",
            content: "I didn’t catch that — try asking again.",
          },
        ]);
    } catch (e) {
      if (controller.signal.aborted) {
        setMessages((m) => (m.at(-1)?.content ? m : m.slice(0, -1)));
      } else {
        setMessages(history.slice(0, -1));
        setDraft(content);
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setStreaming(false);
      abort.current = null;
      input.current?.focus();
    }
  }

  return (
    <div className="assistant">
      <div className="assistant-head">
        <div>
          <h1>Plant assistant</h1>
          <p className="muted">
            Ask about your plants. Answers use your plants, schedule and local
            weather.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            className="button secondary small"
            onClick={() => {
              abort.current?.abort();
              setMessages([]);
              setError("");
            }}
          >
            <SquarePen size={16} /> New chat
          </button>
        )}
      </div>
      <div className="chat" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="chat-avatar large">
              <Sparkles size={22} />
            </span>
            <p>
              Hi {data.profile.name.split(" ")[0]}, I know your {plants.length}{" "}
              plant{plants.length === 1 ? "" : "s"}
              {place ? ` and the weather in ${place.name}` : ""}. What would you
              like to know?
            </p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.role === "assistant" && (
                <span className="chat-avatar" aria-hidden="true">
                  <Sparkles size={15} />
                </span>
              )}
              <div className="chat-bubble">
                {m.role === "assistant" ? (
                  m.content ? (
                    <Markdown text={m.content} />
                  ) : (
                    <span className="typing" aria-label="Thinking">
                      <i />
                      <i />
                      <i />
                    </span>
                  )
                ) : (
                  <p>{m.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          ref={input}
          rows={1}
          value={draft}
          maxLength={4000}
          placeholder="Ask about watering, pests, light, repotting…"
          aria-label="Message the plant assistant"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        {streaming ? (
          <button
            type="button"
            className="send-button"
            onClick={() => abort.current?.abort()}
            aria-label="Stop answer"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            className="send-button"
            disabled={!draft.trim()}
            aria-label="Send"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </form>
      <p className="hint chat-note">
        AI suggestions can be wrong. Check the soil and your plant before
        changing care.
      </p>
    </div>
  );
}
