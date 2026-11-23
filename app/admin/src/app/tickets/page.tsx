import { redirect } from "next/navigation";
import { getCurrentUser, getToken } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listSites } from "@/lib/chat-api";
import { getTicket, listTickets, type TicketStaff, type TicketView } from "@/lib/tickets";
import { TicketsClient } from "@/components/tickets/TicketsClient";

type StaffRow = { id: string; name: string; email: string };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/logout");
  }

  const params = await searchParams;
  const requestedId = typeof params.ticket === "string" && params.ticket ? params.ticket : null;
  const isAdmin = user.role === "admin";

  const token = await getToken();
  const [result, staffResult, sitesResult] = await Promise.all([
    listTickets({}),
    // /users is admin-only on the api; agents never assign, so skip it.
    isAdmin
      ? apiFetch<StaffRow[]>("/users", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
      : Promise.resolve(null),
    isAdmin ? listSites() : Promise.resolve(null),
  ]);

  let initialSelected: TicketView | null = null;
  if (result.ok && requestedId) {
    const found = result.data.items.find((item) => item.id === requestedId);
    if (found) {
      initialSelected = found;
    } else {
      const single = await getTicket(requestedId);
      if (single.ok) {
        initialSelected = single.data;
        result.data.items.unshift(single.data);
      }
    }
  }

  const staff: TicketStaff[] =
    staffResult && staffResult.ok
      ? staffResult.data.map(({ id, name, email }) => ({ id, name, email }))
      : [];
  const sites =
    sitesResult && sitesResult.ok
      ? sitesResult.data.map(({ id, name }) => ({ id, name }))
      : [];

  return (
    <DashboardLayout user={user} fullHeight>
      <TicketsClient
        initial={result.ok ? result.data : null}
        initialError={result.ok ? null : result.error}
        initialSelected={initialSelected}
        initialSelectedId={requestedId}
        currentUser={{ id: user.id, name: user.name }}
        isAdmin={isAdmin}
        staff={staff}
        sites={sites}
      />
    </DashboardLayout>
  );
}
