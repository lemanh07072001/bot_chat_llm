"use client";

import { useRef, useState } from "react";
import { disablePush } from "@/components/notifications/push-client";

/** Hard cap: a hung push endpoint must not keep the agent signed in. */
const LOGOUT_CLEANUP_TIMEOUT_MS = 1500;

/**
 * Logout form that first forgets this device's push subscription.
 *
 * The server action clears the session cookie; once that is gone the API call
 * in `disablePush` cannot be authorised any more, so the unsubscribe has to
 * finish before the form is submitted. It is still best effort and capped by
 * a timeout inside `disablePush` — a dead push endpoint must never trap an
 * agent in a signed-in session.
 */
export function LogoutButton({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const bypass = useRef(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      ref={form}
      action={action}
      onSubmit={(event) => {
        // Second pass: the push cleanup already ran, let the action submit.
        if (bypass.current) {
          bypass.current = false;
          setPending(false);
          return;
        }

        event.preventDefault();
        if (pending) return;
        setPending(true);

        const cleanup = disablePush().catch(() => {});
        const deadline = new Promise<void>((resolve) => setTimeout(resolve, LOGOUT_CLEANUP_TIMEOUT_MS));
        void Promise.race([cleanup, deadline]).finally(() => {
          bypass.current = true;
          form.current?.requestSubmit();
        });
      }}
    >
      <button
        type="submit"
        aria-busy={pending}
        title="Đăng xuất tài khoản"
        className={className}
      >
        {children}
      </button>
    </form>
  );
}
