"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type Me = Schemas["Me"];
export type Member = Schemas["Member"];
export type MemberRole = Schemas["RoleEnum"];
export type Invitation = Schemas["Invitation"];
export type InvitationSent = Schemas["InvitationSent"];
export type JoinPreview = Schemas["JoinPreview"];

const BASE = "/product/staff";

/** Who is signed in, the clinic's users, and invitations to join. Changes are the doctor's. */
export const staffApi = {
  me: () => apiClient.get<Me>(`${BASE}/me/`),
  members: {
    list: () => apiClient.get<Page<Member>>(`${BASE}/members/`, { query: { page_size: MAX_PAGE_SIZE } })
      .then((page) => page.results),
    /** Rejects with OWNER_ONLY or LAST_OWNER. */
    setRole: (id: string, role: MemberRole) => apiClient.patch<Member>(`${BASE}/members/${id}/`, { role }),
    remove: (id: string) => apiClient.delete(`${BASE}/members/${id}/`),
  },
  invitations: {
    list: () => apiClient.get<Page<Invitation>>(`${BASE}/invitations/`, { query: { page_size: MAX_PAGE_SIZE } })
      .then((page) => page.results),
    /** Rejects with ALREADY_MEMBER. The link comes back whether or not it could be emailed. */
    create: (email: string, role: MemberRole) =>
      apiClient.post<InvitationSent>(`${BASE}/invitations/`, { email, role }),
    revoke: (id: string) => apiClient.post<void>(`${BASE}/invitations/${id}/revoke/`),
  },
  join: {
    preview: (token: string) => apiClient.post<JoinPreview>(`${BASE}/join/preview/`, { token }, { auth: false }),
    /** The signed-in account's email must be the invited one (EMAIL_MISMATCH otherwise). */
    accept: (token: string) => apiClient.post<Me>(`${BASE}/join/accept/`, { token }),
  },
};
