"use client";

import type { components } from "../generated";
import { apiClient } from "../browser";
import { MAX_PAGE_SIZE, type Page } from "./page";

type Schemas = components["schemas"];
export type Order = Schemas["Order"];
export type OrderCreate = Schemas["OrderCreateRequest"];
export type OrderKind = Schemas["OrderKindEnum"];
export type OrderDelivery = Schemas["DeliveryEnum"];
export type RequestedTest = Schemas["RequestedTest"];
export type RequestedTestStatus = Schemas["RequestedTestStatusEnum"];
export type RequestedTestUpdate = Schemas["PatchedRequestedTestUpdateRequest"];
export type PendingCount = Schemas["PendingCount"];

const BASE = "/product/orders";

/** Lab requests and prescriptions (doctor only), and the tests the patient is to bring back. */
export const ordersApi = {
  list: (patient: string, kind?: OrderKind) =>
    apiClient.get<Page<Order>>(`${BASE}/`, { query: { patient, kind, page_size: MAX_PAGE_SIZE } })
      .then((page) => page.results),
  /** Rejects with MAILBOX_NOT_READY for email delivery without a clinic mailbox. */
  issue: (body: OrderCreate) => apiClient.post<Order>(`${BASE}/`, body),
  requested: {
    list: (query: { patient?: string; status?: RequestedTestStatus }) =>
      apiClient.get<Page<RequestedTest>>(`${BASE}/requested-tests/`, { query: { ...query, page_size: MAX_PAGE_SIZE } })
        .then((page) => page.results),
    update: (id: string, body: RequestedTestUpdate) =>
      apiClient.patch<RequestedTest>(`${BASE}/requested-tests/${id}/`, body),
    counts: () => apiClient.get<PendingCount>(`${BASE}/requested-tests/counts/`),
  },
};
