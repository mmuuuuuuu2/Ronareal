import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePublishState, type PublishState } from "./state.ts";

/** Status publikasi milik pengguna sesi (RPC get_publish_state memakai auth.uid(); tidak menerima user id). */
export async function loadPublishState(): Promise<PublishState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_publish_state");
  if (error) throw new Error("Status publikasi tidak dapat dimuat.");
  return parsePublishState(data);
}
