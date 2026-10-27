"use client";

import { useSyncExternalStore } from "react";
import { tokenFromHash } from "../intake/logic";

const TOKEN_KEY = "vclinic.join.token";
const CHALLENGE_KEY = "vclinic.join.challenge";

export interface StoredChallenge {
  token: string;
  challengeId: string;
  destination: string;
}

// sessionStorage may be unavailable or throw; joining still works, a reload just starts over.
function get(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // not kept
  }
}

/** Kept because the `#t=` fragment is lost when sign-in redirects back here. */
export const rememberToken = (token: string) => set(TOKEN_KEY, token);

export function storedChallenge(token: string): StoredChallenge | null {
  try {
    const value = JSON.parse(get(CHALLENGE_KEY) ?? "null") as Partial<StoredChallenge> | null;
    if (value?.token === token && typeof value.challengeId === "string") {
      return { token, challengeId: value.challengeId, destination: String(value.destination ?? "") };
    }
  } catch {
    // ignore a bad entry
  }
  return null;
}

export const rememberChallenge = (c: StoredChallenge) => set(CHALLENGE_KEY, JSON.stringify(c));

export function forgetJoin() {
  set(TOKEN_KEY, null);
  set(CHALLENGE_KEY, null);
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The invitation token: from the address, else the one kept for this tab. undefined on the server. */
export function useJoinToken(): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => tokenFromHash(window.location.hash) ?? get(TOKEN_KEY),
    () => undefined,
  );
}
