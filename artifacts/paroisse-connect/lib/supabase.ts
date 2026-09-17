import { createClient } from "@supabase/supabase-js";

// EXPO_PUBLIC_ est obligatoire pour que Metro inline la valeur dans le bundle web.
// La clé publishable est conçue pour être exposée côté client (limitée par les
// politiques RLS). Elle remplace l'ancienne "anon key" dans les nouveaux projets.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??   // fallback anciens projets
  "";

export const supabase = createClient(supabaseUrl, supabaseKey);
