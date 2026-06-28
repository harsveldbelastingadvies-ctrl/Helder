import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseInsert, supabaseSelect, supabaseSingle, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type NoteRow = { id: string; body: string; created_at: string };
type TaskRow = { id: string; title: string; due_date: string; completed: boolean | number; created_at: string };

async function customerExists(customerId: string, userId: string) {
  if (usesSupabaseStorage()) {
    return Boolean(await supabaseSingle<{ id: string }>("customers", { select: "id", filters: { id: customerId, user_id: userId } }));
  }
  const { db } = await import("@/lib/db");
  return Boolean(db.prepare("SELECT id FROM customers WHERE id = ? AND user_id = ?").get(customerId, userId));
}

async function getCrm(customerId: string, userId: string) {
  if (usesSupabaseStorage()) {
    const notes = await supabaseSelect<NoteRow>("customer_notes", {
      select: "id,body,created_at",
      filters: { customer_id: customerId, user_id: userId },
      order: "created_at.desc",
    });
    const tasks = await supabaseSelect<TaskRow>("customer_tasks", {
      select: "id,title,due_date,completed,created_at",
      filters: { customer_id: customerId, user_id: userId },
      order: "completed.asc,due_date.asc,created_at.desc",
    });
    return {
      notes: notes.map((note) => ({ id: note.id, body: note.body, createdAt: note.created_at })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueDate: task.due_date,
        completed: Boolean(task.completed),
        createdAt: task.created_at,
      })),
    };
  }
  const { db } = await import("@/lib/db");
  const notes = db.prepare(`SELECT id, body, created_at AS createdAt FROM customer_notes
    WHERE customer_id = ? AND user_id = ? ORDER BY created_at DESC`).all(customerId, userId);
  const tasks = db.prepare(`SELECT id, title, due_date AS dueDate, completed, created_at AS createdAt FROM customer_tasks
    WHERE customer_id = ? AND user_id = ? ORDER BY completed ASC, due_date ASC, created_at DESC`).all(customerId, userId);
  return { notes, tasks: (tasks as Array<{ completed: number }>).map((task) => ({ ...task, completed: Boolean(task.completed) })) };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  if (!await customerExists(id, user.id)) return NextResponse.json({ error: "Deze klant bestaat niet." }, { status: 404 });
  return NextResponse.json({ crm: await getCrm(id, user.id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  if (!await customerExists(id, user.id)) return NextResponse.json({ error: "Deze klant bestaat niet." }, { status: 404 });
  const input = await request.json() as { type?: "note" | "task"; body?: string; title?: string; dueDate?: string };
  if (input.type === "note") {
    if (!input.body?.trim()) return NextResponse.json({ error: "Schrijf eerst een notitie." }, { status: 400 });
    if (usesSupabaseStorage()) {
      await supabaseInsert("customer_notes", { id: `note-${randomUUID()}`, user_id: user.id, customer_id: id, body: input.body.trim() });
    } else {
      const { db } = await import("@/lib/db");
      db.prepare("INSERT INTO customer_notes (id, user_id, customer_id, body) VALUES (?, ?, ?, ?)")
        .run(`note-${randomUUID()}`, user.id, id, input.body.trim());
    }
  } else if (input.type === "task") {
    if (!input.title?.trim() || !input.dueDate) return NextResponse.json({ error: "Vul een actie en datum in." }, { status: 400 });
    if (usesSupabaseStorage()) {
      await supabaseInsert("customer_tasks", { id: `task-${randomUUID()}`, user_id: user.id, customer_id: id, title: input.title.trim(), due_date: input.dueDate });
    } else {
      const { db } = await import("@/lib/db");
      db.prepare("INSERT INTO customer_tasks (id, user_id, customer_id, title, due_date) VALUES (?, ?, ?, ?, ?)")
        .run(`task-${randomUUID()}`, user.id, id, input.title.trim(), input.dueDate);
    }
  } else {
    return NextResponse.json({ error: "Onbekend type CRM-item." }, { status: 400 });
  }
  return NextResponse.json({ crm: await getCrm(id, user.id) }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await context.params;
  if (!await customerExists(id, user.id)) return NextResponse.json({ error: "Deze klant bestaat niet." }, { status: 404 });
  const input = await request.json() as { taskId?: string; completed?: boolean };
  if (!input.taskId || typeof input.completed !== "boolean") return NextResponse.json({ error: "De actie kon niet worden bijgewerkt." }, { status: 400 });
  if (usesSupabaseStorage()) {
    const rows = await supabaseUpdate("customer_tasks", { id: input.taskId, customer_id: id, user_id: user.id }, { completed: input.completed });
    if (!rows.length) return NextResponse.json({ error: "Deze actie bestaat niet." }, { status: 404 });
  } else {
    const { db } = await import("@/lib/db");
    const result = db.prepare("UPDATE customer_tasks SET completed = ? WHERE id = ? AND customer_id = ? AND user_id = ?")
      .run(input.completed ? 1 : 0, input.taskId, id, user.id);
    if (!result.changes) return NextResponse.json({ error: "Deze actie bestaat niet." }, { status: 404 });
  }
  return NextResponse.json({ crm: await getCrm(id, user.id) });
}

