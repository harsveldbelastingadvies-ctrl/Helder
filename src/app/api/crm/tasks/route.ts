import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { supabaseSelect, supabaseUpdate, usesSupabaseStorage } from "@/lib/supabase";

export const runtime = "nodejs";

type OpenTaskRow = {
  id: string;
  title: string;
  due_date: string;
  customer_id: string;
  customers: { id: string; name: string } | null;
};

async function getOpenTasks(userId: string) {
  if (usesSupabaseStorage()) {
    const rows = await supabaseSelect<OpenTaskRow>("customer_tasks", {
      select: "id,title,due_date,customer_id,customers(id,name)",
      filters: { user_id: userId, completed: false },
      order: "due_date.asc,created_at.asc",
      limit: 8,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      dueDate: row.due_date,
      customerId: row.customers?.id ?? row.customer_id,
      customerName: row.customers?.name ?? "Klant",
    }));
  }
  const { db } = await import("@/lib/db");
  return db.prepare(`SELECT customer_tasks.id, customer_tasks.title,
      customer_tasks.due_date AS dueDate, customers.id AS customerId,
      customers.name AS customerName
    FROM customer_tasks
    JOIN customers ON customers.id = customer_tasks.customer_id
    WHERE customer_tasks.user_id = ? AND customer_tasks.completed = 0
    ORDER BY customer_tasks.due_date ASC, customer_tasks.created_at ASC
    LIMIT 8`).all(userId);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  return NextResponse.json({ tasks: await getOpenTasks(user.id) });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const input = await request.json() as { taskId?: string };
  if (!input.taskId) return NextResponse.json({ error: "Deze actie kon niet worden bijgewerkt." }, { status: 400 });
  if (usesSupabaseStorage()) {
    const rows = await supabaseUpdate("customer_tasks", { id: input.taskId, user_id: user.id }, { completed: true });
    if (!rows.length) return NextResponse.json({ error: "Deze actie bestaat niet." }, { status: 404 });
  } else {
    const { db } = await import("@/lib/db");
    const result = db.prepare("UPDATE customer_tasks SET completed = 1 WHERE id = ? AND user_id = ?")
      .run(input.taskId, user.id);
    if (!result.changes) return NextResponse.json({ error: "Deze actie bestaat niet." }, { status: 404 });
  }
  return NextResponse.json({ tasks: await getOpenTasks(user.id) });
}

