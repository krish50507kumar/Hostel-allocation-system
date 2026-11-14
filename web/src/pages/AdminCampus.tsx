import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";

type Note = { id: string; title: string; content: string; category: string; updated_at: string };
type Draft = { id: string | null; title: string; content: string; category: string };

const emptyDraft: Draft = { id: null, title: "", content: "", category: "general" };

export default function AdminCampus() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("campus_ai_notes")
      .select("id, title, content, category, updated_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    if (error) return setErr(friendly(error));
    setNotes((data ?? []) as Note[]);
  }

  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg(""); setBusy(true);
    const { error } = await supabase.rpc("admin_upsert_campus_ai_note", {
      p_note_id: draft.id,
      p_title: draft.title,
      p_content: draft.content,
      p_category: draft.category,
    });
    setBusy(false);
    if (error) return setErr(friendly(error));
    setMsg(draft.id ? "Campus note updated." : "Campus note added.");
    setDraft(emptyDraft);
    load();
  }

  async function remove(note: Note) {
    if (!window.confirm(`Remove "${note.title}" from the AI campus knowledge?`)) return;
    setErr(""); setMsg("");
    const { error } = await supabase.rpc("admin_delete_campus_ai_note", { p_note_id: note.id });
    if (error) return setErr(friendly(error));
    setMsg("Campus note removed.");
    if (draft.id === note.id) setDraft(emptyDraft);
    load();
  }

  return (
    <section>
      <div className="settings-heading">
        <div className="page-hero__eyebrow">Admin</div>
        <h1>Campus AI Knowledge</h1>
        <p>Add as many campus descriptions and notes as needed. The AI uses these saved notes when answering students.</p>
      </div>
      {msg && <div className="alert alert-success" role="status">{msg}</div>}
      {err && <div className="alert alert-error" role="alert">{err}</div>}

      <details className="admin-section admin-dropdown" open>
        <summary className="admin-dropdown__summary">
          <span>
            <span className="section-label">{draft.id ? "Edit campus note" : "Add campus note"}</span>
            <span className="admin-dropdown__hint">Create a separate note for each campus fact, facility, rule, direction or instruction.</span>
          </span>
          <span className="admin-dropdown__chevron" aria-hidden="true">⌄</span>
        </summary>
        <form className="admin-dropdown__content card-pad form-group" onSubmit={save}>
          <label>
            Note title
            <input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Main library opening hours" />
          </label>
          <label>
            Category
            <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. facilities, transport, rules" />
          </label>
          <label>
            Description / AI instruction
            <textarea required rows={7} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Write the campus information the AI should use when answering students." />
          </label>
          <div className="admin-edit-actions">
            <button type="submit" disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add note"}</button>
            {draft.id && <button type="button" className="btn-ghost" onClick={() => setDraft(emptyDraft)}>Cancel edit</button>}
          </div>
        </form>
      </details>

      <details className="admin-section admin-dropdown" open>
        <summary className="admin-dropdown__summary">
          <span>
            <span className="section-label">Saved campus notes</span>
            <span className="admin-dropdown__hint">{notes.length} note{notes.length === 1 ? "" : "s"} available to the AI assistant.</span>
          </span>
          <span className="admin-dropdown__chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="admin-dropdown__content">
          {notes.length === 0 && <p className="state">No campus notes have been added yet.</p>}
          <div className="admin-place-list">
            {notes.map((note) => (
              <article className="admin-place-row" key={note.id}>
                <div>
                  <strong>{note.title}</strong>
                  <span>{note.category}</span>
                  <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{note.content}</p>
                </div>
                <div className="admin-edit-actions">
                  <button className="btn-outline btn-sm" type="button" onClick={() => setDraft({ id: note.id, title: note.title, content: note.content, category: note.category })}>Edit</button>
                  <button className="btn-ghost btn-sm" type="button" onClick={() => remove(note)}>Remove</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
