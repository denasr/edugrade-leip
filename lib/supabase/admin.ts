import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Bypassa RLS por completo. Solo se importa desde Server Actions, después de
// verificar la autorización con el cliente normal (lib/supabase/server.ts) —
// nunca se expone al cliente ni se usa para leer/escribir sin ese chequeo previo.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
