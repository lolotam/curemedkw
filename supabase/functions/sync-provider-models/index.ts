import { getAdminClient } from "../_shared/supabase-admin.ts";
import { createModelSyncHandler } from "./handler.ts";

Deno.serve(createModelSyncHandler(getAdminClient()));
