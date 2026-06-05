import { useState, useRef, useEffect } from "react";
import { Plus, ArrowLeft, Clock, ShieldCheck, X } from "lucide-react";

export default function MemberHome({ email }: { email?: string }) {
  const [view, setView] = useState<"home" | "conversation">("home");
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const active = conversations.find((c) => c.id === activeId) || null;

  const create = (name: string, em: string, topic: string) => {
    const c = {
      id: crypto.randomUUID(), name, email: em, topic,
      lastAt: new Date(),
      messages: [{ sender: "bridget",
        text: `I'm Bridget. I'll stay with you and ${name} here. Everything said is timestamped and kept — a record that belongs to both of you.`,
        time: now() }],
    };
    setConversations((p) => [c, ...p]); setModal(false);
    setActiveId(c.id); setView("conversation");
  };
  const addMsg = (id: string, m: any) =>
    setConversations((p) => p.map((c) =>
      c.id === id ? { ...c, messages: [...c.messages, m], lastAt: new Date() } : c));

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {view === "home" ? (
        <div className="max-w-2xl mx-auto px-5 py-10">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="text-2xl font-light">Your conversations</h1>
              <p className="text-stone-500 text-sm mt-1">Private, witnessed, and kept forever.</p>
            </div>
            <button onClick={() => setModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition">
              <Plus size={16} /> Start a conversation
            </button>
          </div>
          {conversations.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-stone-200 rounded-2xl bg-white">
              <div className="text-3xl text-stone-300 mb-3">ש</div>
              <p className="text-stone-600 font-medium">No conversations yet</p>
              <p className="text-stone-400 text-sm mt-1 max-w-xs mx-auto">
                Some conversations deserve a witness. Start one — Bridget will facilitate, and the record stays with both of you.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((c) => (
                <button key={c.id} onClick={() => { setActiveId(c.id); setView("conversation"); }}
                  className="w-full text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 hover:shadow-sm transition flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.name}</span>
                      <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                    </div>
                    <div className="text-sm text-stone-500 truncate">
                      {c.topic || "No topic"} · {c.messages.length} on record
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-stone-400 shrink-0 ml-3">
                    <Clock size={12} />{timeAgo(c.lastAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : active ? (
        <ConvoView convo={active} onBack={() => { setView("home"); setActiveId(null); }} addMsg={addMsg} />
      ) : null}
      {modal && <NewModal onClose={() => setModal(false)} onCreate={create} />}
    </div>
  );
}

function ConvoView({ convo, onBack, addMsg }: any) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [convo.messages]);
  const send = () => {
    const t = draft.trim(); if (!t) return;
    addMsg(convo.id, { sender: "you", text: t, time: now() });
    setDraft("");
  };
  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      <div className="bg-white border-b border-stone-200 px-4 py-2.5 flex items-center gap-3">
        <button onClick={onBack} className="text-stone-400 hover:text-stone-700 transition"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <div className="font-medium leading-none truncate">{convo.name}</div>
          <div className="text-xs text-stone-400 mt-0.5">{convo.topic || "facilitated by Bridget"}</div>
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-stone-400">
          <ShieldCheck size={13} className="text-emerald-500" />{convo.messages.length} on record
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl w-full mx-auto">
        {convo.messages.map((m: any, i: number) => m.sender === "bridget" ? (
          <div key={i} className="flex justify-center"><div className="max-w-md text-center">
            <div className="text-[10px] uppercase tracking-widest text-amber-600/70 mb-1">Bridget</div>
            <div className="inline-block bg-amber-50 border border-amber-100 text-stone-700 text-sm rounded-2xl px-4 py-2 italic">{m.text}</div>
          </div></div>
        ) : (
          <div key={i} className="flex justify-end"><div className="max-w-[75%] flex flex-col items-end">
            <div className="text-[11px] text-stone-400 mb-1 px-1">You · {m.time}</div>
            <div className="rounded-2xl px-4 py-2 text-sm bg-stone-800 text-stone-50">{m.text}</div>
          </div></div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="bg-white border-t border-stone-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Speak…"
            className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:border-stone-400" />
          <button onClick={send} disabled={!draft.trim()}
            className="px-5 py-3 rounded-xl bg-stone-900 text-white font-medium disabled:opacity-30 hover:bg-stone-800 transition">Send</button>
        </div>
      </div>
    </div>
  );
}

function NewModal({ onClose, onCreate }: any) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [topic, setTopic] = useState("");
  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center p-4 z-30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-light">Start a conversation</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <p className="text-sm text-stone-500 mb-5">Invite the other person. Bridget will facilitate; the record belongs to you both.</p>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:border-stone-400" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:border-stone-400" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this about? (optional)" className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:border-stone-400" />
        </div>
        <button onClick={() => name.trim() && onCreate(name.trim(), email.trim(), topic.trim())} disabled={!name.trim()}
          className="w-full mt-5 py-3 rounded-xl bg-stone-900 text-white font-medium disabled:opacity-30 hover:bg-stone-800 transition">Create & invite</button>
      </div>
    </div>
  );
}

function now() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function timeAgo(d: any) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
