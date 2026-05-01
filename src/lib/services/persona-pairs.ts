import { clientFetch } from "@/lib/client-api";
import type { PersonaPairResponse } from "@/types/persona-pair";

export async function fetchPersonaPair(
  bookId: string,
  aId: string,
  bId: string
): Promise<PersonaPairResponse> {
  return clientFetch<PersonaPairResponse>(
    `/api/persona-pairs/${encodeURIComponent(bookId)}/${encodeURIComponent(aId)}/${encodeURIComponent(bId)}`
  );
}
