"use client";

import { useSyncExternalStore } from "react";
import { tokenFromHash } from "./logic";

const KEY = "vclinic.intake";

interface StoredSession {
  token: string;
  session: string;
  step: number;
}

// sessionStorage can be missing or throw (private mode, blocked storage); the form still works without it.
function read(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    if (value && typeof value.token === "string" && typeof value.session === "string") {
      return { token: value.token, session: value.session, step: Number(value.step) || 0 };
    }
  } catch {
    // fall through
  }
  return null;
}

/** The verified session for this link, kept for the tab so a reload continues the form. */
export function storedSession(token: string): StoredSession | null {
  const value = read();
  return value?.token === token ? value : null;
}

export function storeSession(token: string, session: string, step = 0) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ token, session, step }));
  } catch {
    // not kept; a reload asks for the date of birth again
  }
}

export function storeStep(token: string, step: number) {
  const value = storedSession(token);
  if (value) storeSession(token, value.session, step);
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * The `#t=` token from the address. undefined while rendering on the server, null when the link has none.
 * The token stays in the fragment so it never reaches a server log.
 */
export function useHashToken(): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => tokenFromHash(window.location.hash),
    () => undefined,
  );
}
