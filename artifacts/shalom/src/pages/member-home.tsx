import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, ArrowLeft, Clock, ShieldCheck, X, Sun, Moon } from "lucide-react";
import { applyTheme, initTheme } from "@/lib/theme";

type Message = { id: string; sender: string; text: string; createdAt: string };
type Conversation = {
  id: string; partnerName: string; partnerEmail?: string; topic?: string;
  mode: "witness" | "mediated"; updatedAt: string; messages?: Message[];
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (res.status === 401) {
    window.location.href = "/";
    throw new Error("401");
  }
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export default function MemberHome({ email }: { email?: string }) {
  const [view, setView] = useState<"home" | "conversation">("home");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(() => initTheme());
  const active = conversations.find((c) => c.id === activeId) || null;

  const toggleTheme = () => {
    const next = !dark;
    applyTheme(next);
    setDark(next);
  };

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch("/conversations");
      setConversations(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (view !== "home") return;
    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const data: Conversation[] = await apiFetch("/conversations");
        setConversations((prev) =>
          data.map((c) => {
            const existing = prev.find((p) => p.id === c.id);
            return existing?.messages ? { ...c, messages: existing.messages } : c;
          })
        );
      } catch {}
    }, 10_000);
    return () => clearInterval(interval);
  }, [view]);

  useEffect(() => {
    if (view !== "conversation" || !activeId) return;
    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const messages = await apiFetch(`/conversations/${activeId}/messages`);
        setConversations((p) => p.map((c) => c.id === activeId ? { ...c, messages } : c));
      } catch {}
    }, 4_000);
    return () => clearInterval(interval);
  }, [activeId, view]);

  const create = async (name: string, em: string, topic: string, mode: "witness" | "mediated") => {
    try {
      const convo = await apiFetch("/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerName: name, partnerEmail: em || undefined, topic: topic || undefined, mode }),
      });
      setConversations((p) => [convo, ...p]);
      setModal(false);
      setActiveId(convo.id);
      setView("conversation");
    } catch {}
  };

  const addMsg = async (id: string, text: string): Promise<Message | null> => {
    try {
      const { message, bridgetMessage } = await apiFetch(`/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setConversations((p) => p.map((c) => {
        if (c.id !== id) return c;
        const appended = [...(c.messages || []), message];
        if (bridgetMessage) appended.push(bridgetMessage);
        return { ...c, messages: appended, updatedAt: new Date().toISOString() };
      }));
      return message;
    } catch { return null; }
  };

  const updateTopic = async (id: string, topic: string): Promise<Conversation | null> => {
    try {
      const convo = await apiFetch(`/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      setConversations((p) => p.map((c) => c.id === id ? { ...c, ...convo } : c));
      return convo;
    } catch { return null; }
  };

  const openConvo = async (id: string) => {
    setActiveId(id);
    setView("conversation");
    try {
      const messages = await apiFetch(`/conversations/${id}/messages`);
      setConversations((p) => p.map((c) => c.id === id ? { ...c, messages } : c));
    } catch {}
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      {view === "home" ? (
        <div className="max-w-2xl mx-auto px-5 py-10">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2">
              <span className="text-2xl text-stone-800 dark:text-stone-200">ש</span>
              <span className="text-xl font-light tracking-wide text-stone-800 dark:text-stone-200">Shalom</span>
            </div>
            <button onClick={toggleTheme}
              className="p-2 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300 transition"
              aria-label="Toggle theme">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="text-2xl font-light">Your conversations</h1>
              <p className="text-stone-500 dark:text-stone-400 text-sm mt-1">Private, witnessed, and kept forever.</p>
            </div>
            <button onClick={() => setModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-200 text-white dark:text-stone-900 text-sm font-medium hover:bg-stone-800 dark:hover:bg-stone-300 transition">
              <Plus size={16} /> Start a conversation
            </button>
          </div>
          {loading ? (
            <div className="text-center py-20 text-stone-400 text-sm">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-stone-200 dark:border-stone-700 rounded-2xl bg-white dark:bg-stone-900">
              <div className="text-3xl text-stone-300 dark:text-stone-600 mb-3">ש</div>
              <p className="text-stone-600 dark:text-stone-300 font-medium">No conversations yet</p>
              <p className="text-stone-400 text-sm mt-1 max-w-xs mx-auto">
                Some conversations deserve a witness. Start one — Bridget will facilitate, and the record stays with both of you.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((c) => (
                <button key={c.id} onClick={() => openConvo(c.id)}
                  className="w-full text-left bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl p-4 hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-sm transition flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.partnerName}</span>
                      <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                      {c.mode === "mediated" && (
                        <span className="text-[10px] uppercase tracking-widest text-amber-600/80 dark:text-amber-400/80 border border-amber-200 dark:border-amber-900 rounded px-1">mediated</span>
                      )}
                    </div>
                    <div className="text-sm text-stone-500 dark:text-stone-400 truncate">
                      {c.topic || "No topic"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-stone-400 shrink-0 ml-3">
                    <Clock size={12} />{timeAgo(c.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : active ? (
        <ConvoView convo={active} onBack={() => { setView("home"); setActiveId(null); }} addMsg={addMsg} email={email} updateTopic={updateTopic} />
      ) : null}
      {modal && <NewModal onClose={() => setModal(false)} onCreate={create} />}
    </div>
  );
}

function ConvoView({ convo, onBack, addMsg, email, updateTopic }: {
  convo: Conversation;
  onBack: () => void;
  addMsg: (id: string, text: string) => Promise<Message | null>;
  email?: string;
  updateTopic: (id: string, topic: string) => Promise<Conversation | null>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState(false);
  const [inviteAlreadyJoined, setInviteAlreadyJoined] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState(convo.topic || "");
  const endRef = useRef<HTMLDivElement>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTopicDraft(convo.topic || ""); }, [convo.id, convo.topic]);
  useEffect(() => { if (editingTopic) topicInputRef.current?.focus(); }, [editingTopic]);

  const startEditTopic = () => {
    setTopicDraft(convo.topic || "");
    setEditingTopic(true);
  };

  const saveTopic = async () => {
    setEditingTopic(false);
    const next = topicDraft.trim();
    if (next === (convo.topic || "")) return;
    await updateTopic(convo.id, next);
  };

  const cancelEditTopic = () => {
    setTopicDraft(convo.topic || "");
    setEditingTopic(false);
  };

  const invite = async () => {
    setInviteError(false);
    setInviteAlreadyJoined(false);
    setInviteUrl(null);
    try {
      const res = await fetch(`/conversations/${convo.id}/invite`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 409) { setInviteAlreadyJoined(true); return; }
      if (!res.ok) { setInviteError(true); return; }
      const data = await res.json();
      setInviteUrl(data.inviteUrl);
    } catch {
      setInviteError(true);
    }
  };

  const dismissInvite = () => {
    setInviteUrl(null);
    setInviteError(false);
    setInviteAlreadyJoined(false);
  };
  const messages = convo.messages || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setSending(true);
    setDraft("");
    await addMsg(convo.id, t);
    setSending(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      <div className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 px-4 py-2.5 flex items-center gap-3">
        <button onClick={onBack} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <div className="font-medium leading-none truncate">{convo.partnerName}</div>
          {editingTopic ? (
            <input
              ref={topicInputRef}
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              onBlur={saveTopic}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.currentTarget.blur(); }
                else if (e.key === "Escape") { cancelEditTopic(); }
              }}
              maxLength={200}
              placeholder="Add a topic"
              className="text-xs text-stone-600 dark:text-stone-300 mt-0.5 px-1 -mx-1 rounded border border-stone-300 dark:border-stone-600 focus:outline-none focus:border-stone-400 dark:focus:border-stone-500 bg-white dark:bg-stone-800 w-full max-w-[240px]"
            />
          ) : (
            <button
              onClick={startEditTopic}
              className="text-xs text-stone-400 mt-0.5 truncate hover:text-stone-600 dark:hover:text-stone-300 transition text-left"
            >
              {convo.topic || "Add a topic"}
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={invite}
            className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition">
            Invite
          </button>
          <span className="flex items-center gap-1 text-xs text-stone-400">
            <ShieldCheck size={13} className="text-emerald-500" />{messages.length} on record
          </span>
        </div>
      </div>
      {(inviteUrl || inviteError || inviteAlreadyJoined) && (
        <div className="bg-stone-50 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700 px-4 py-2.5 flex items-center gap-2">
          {inviteUrl ? (
            <>
              <input readOnly value={inviteUrl}
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 focus:outline-none min-w-0" />
              <button onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="shrink-0 text-xs px-3 py-2 rounded-lg bg-stone-900 dark:bg-stone-200 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-300 transition">
                Copy
              </button>
            </>
          ) : inviteAlreadyJoined ? (
            <p className="flex-1 text-xs text-stone-500 dark:text-stone-400">Partner already joined</p>
          ) : (
            <p className="flex-1 text-xs text-red-500">Couldn't create invite.</p>
          )}
          <button onClick={dismissInvite}
            className="shrink-0 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center text-stone-400 text-sm py-8">Loading messages…</div>
        )}
        {messages.map((m) => {
          if (m.sender === "bridget") {
            return (
              <div key={m.id} className="flex justify-center"><div className="max-w-md text-center">
                <div className="text-[10px] uppercase tracking-widest text-amber-600/70 dark:text-amber-400/70 mb-1">Bridget</div>
                <div className="inline-block bg-amber-50 dark:bg-amber-950 border border-amber-100 dark:border-amber-900 text-stone-700 dark:text-stone-300 text-sm rounded-2xl px-4 py-2 italic">{m.text}</div>
              </div></div>
            );
          }
          const isOwn = !!email && m.sender === email;
          return (
            <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                <div className="text-[11px] text-stone-400 mb-1 px-1">
                  {isOwn ? "You" : <span title={m.sender}>{displayName(m.sender)}</span>} · {fmtTime(m.createdAt)}
                </div>
                <div className={`rounded-2xl px-4 py-2 text-sm ${isOwn ? "bg-stone-800 dark:bg-stone-200 text-stone-50 dark:text-stone-900" : "bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100"}`}>
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Speak…"
            className="flex-1 px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:border-stone-400 dark:focus:border-stone-500" />
          <button onClick={send} disabled={!draft.trim() || sending}
            className="px-5 py-3 rounded-xl bg-stone-900 dark:bg-stone-200 text-white dark:text-stone-900 font-medium disabled:opacity-30 hover:bg-stone-800 dark:hover:bg-stone-300 transition">Send</button>
        </div>
      </div>
    </div>
  );
}

function NewModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string, email: string, topic: string, mode: "witness" | "mediated") => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<"witness" | "mediated">("witness");
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(name.trim(), email.trim(), topic.trim(), mode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-30" onClick={onClose}>
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-light">Start a conversation</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"><X size={18} /></button>
        </div>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-5">Invite the other person. Bridget will facilitate; the record belongs to you both.</p>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name"
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:border-stone-400 dark:focus:border-stone-500" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email"
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:border-stone-400 dark:focus:border-stone-500" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this about? (optional)"
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:border-stone-400 dark:focus:border-stone-500" />
          <div className="flex items-center justify-between rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-stone-700 dark:text-stone-300">Bridget mediates</div>
              <div className="text-xs text-stone-400 mt-0.5">Bridget actively facilitates the exchange</div>
            </div>
            <button
              onClick={() => setMode((m) => m === "witness" ? "mediated" : "witness")}
              className={`w-11 h-6 rounded-full transition-colors relative ${mode === "mediated" ? "bg-amber-500" : "bg-stone-200 dark:bg-stone-700"}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${mode === "mediated" ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
        </div>
        <button onClick={handleCreate}
          disabled={!name.trim() || submitting}
          className="w-full mt-5 py-3 rounded-xl bg-stone-900 dark:bg-stone-200 text-white dark:text-stone-900 font-medium disabled:opacity-30 hover:bg-stone-800 dark:hover:bg-stone-300 transition">
          {submitting ? "Creating…" : "Create & invite"}
        </button>
      </div>
    </div>
  );
}

function displayName(sender: string) {
  const local = sender.split("@")[0] || sender;
  return local.charAt(0).toUpperCase() + local.slice(1);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
