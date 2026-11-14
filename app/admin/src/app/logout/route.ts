import { redirect } from "next/navigation";
import { deleteSession } from "@/lib/session";

// A stale/invalid token cookie can't be deleted from a Server Component, so
// pages redirect here (a Route Handler, which can mutate cookies) instead.
export async function GET() {
  await deleteSession();
  redirect("/login");
}
