// @ts-nocheck
// This file runs in Deno (Supabase Edge Functions) and uses Deno-specific APIs.
// It is excluded from the project's TypeScript type checking.
import { createClient } from "@supabase/supabase-js";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RestoreRequest {
  receipt: string;
  anonymousUserId: string;
  platform: "ios" | "android";
}

interface SubscriptionRecord {
  id: string;
  anonymous_user_id: string;
  receipt: string;
  status: "free" | "premium" | "expired";
  tier: "monthly" | "annual" | null;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
  migrated_from: string | null;
}

// Validate receipt with Apple/Google (simplified — production would call Apple/Google APIs)
async function validateReceipt(
  receipt: string,
  _platform: "ios" | "android",
): Promise<{
  valid: boolean;
  originalUserId?: string;
  expiryDate?: string;
  tier?: "monthly" | "annual";
  error?: string;
}> {
  // In production, this would call Apple's verifyReceipt endpoint or Google Play Developer API
  // For now, we validate by checking if the receipt exists in our database
  return { valid: true };
}

// Find existing subscription by receipt
async function findSubscriptionByReceipt(
  supabase: ReturnType<typeof createClient>,
  receipt: string,
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("receipt", receipt)
    .single();

  if (error || !data) return null;
  return data as SubscriptionRecord;
}

// Find active user by anonymous user ID (not soft-deleted)
async function findActiveUser(
  supabase: ReturnType<typeof createClient>,
  anonymousUserId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("anonymous_users")
    .select("id")
    .eq("id", anonymousUserId)
    .is("migrated_to", null)
    .single();

  if (error || !data) return null;
  return data;
}

// Mark old user as migrated (soft delete)
async function markUserMigrated(
  supabase: ReturnType<typeof createClient>,
  oldUserId: string,
  newUserId: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Mark old user as migrated
  await supabase
    .from("anonymous_users")
    .update({
      migrated_to: newUserId,
      migrated_at: now,
      updated_at: now,
    })
    .eq("id", oldUserId);

  // Mark old user's subscription as migrated
  await supabase
    .from("subscriptions")
    .update({
      migrated_to: newUserId,
      migrated_at: now,
      updated_at: now,
    })
    .eq("anonymous_user_id", oldUserId);
}

// Transfer subscription to new user
async function transferSubscription(
  supabase: ReturnType<typeof createClient>,
  oldSubscription: SubscriptionRecord,
  newUserId: string,
): Promise<SubscriptionRecord> {
  const now = new Date().toISOString();

  // Create new subscription for the new user
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      anonymous_user_id: newUserId,
      receipt: oldSubscription.receipt,
      status: oldSubscription.status,
      tier: oldSubscription.tier,
      expiry_date: oldSubscription.expiry_date,
      migrated_from: oldSubscription.anonymous_user_id,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to transfer subscription: ${error.message}`);
  }

  return data as SubscriptionRecord;
}

// Create or update subscription for new user
async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  anonymousUserId: string,
  receipt: string,
  status: "free" | "premium" | "expired",
  tier: "monthly" | "annual" | null,
  expiryDate: string | null,
): Promise<SubscriptionRecord> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert({
      anonymous_user_id: anonymousUserId,
      receipt,
      status,
      tier,
      expiry_date: expiryDate,
      updated_at: now,
    }, {
      onConflict: "anonymous_user_id",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }

  return data as SubscriptionRecord;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { receipt, anonymousUserId, platform } = await req.json() as RestoreRequest;

    if (!receipt || !anonymousUserId) {
      return new Response(
        JSON.stringify({ error: "Missing receipt or anonymousUserId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if the new user exists and is active
    const newUser = await findActiveUser(supabase, anonymousUserId);
    if (!newUser) {
      return new Response(
        JSON.stringify({ error: "Invalid user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find existing subscription by receipt
    const existingSubscription = await findSubscriptionByReceipt(supabase, receipt);

    if (!existingSubscription) {
      // No existing subscription found for this receipt
      return new Response(
        JSON.stringify({
          success: false,
          error: "NO_PURCHASES_FOUND",
          message: "No previous purchases found for this account",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if receipt is already linked to the current user
    if (existingSubscription.anonymous_user_id === anonymousUserId) {
      // User already owns this subscription — just refresh their status
      return new Response(
        JSON.stringify({
          success: true,
          status: existingSubscription.status,
          tier: existingSubscription.tier,
          expiryDate: existingSubscription.expiry_date,
          message: "Subscription already active on this device",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if the old user is already migrated
    const oldUser = await findActiveUser(supabase, existingSubscription.anonymous_user_id);
    if (!oldUser) {
      // Old user is already migrated — check if it was migrated to this user
      const { data: migratedUser } = await supabase
        .from("anonymous_users")
        .select("migrated_to")
        .eq("id", existingSubscription.anonymous_user_id)
        .single();

      if (migratedUser?.migrated_to && migratedUser.migrated_to !== anonymousUserId) {
        // Receipt is already linked to another active user
        return new Response(
          JSON.stringify({
            success: false,
            error: "ALREADY_LINKED",
            message: "This purchase is already linked to another device. Contact support if you need help.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // If migrated_to is this user, it's a re-restore — just update
      if (migratedUser?.migrated_to === anonymousUserId) {
        // Already migrated to this user, update subscription
        const updated = await upsertSubscription(
          supabase,
          anonymousUserId,
          receipt,
          existingSubscription.status,
          existingSubscription.tier,
          existingSubscription.expiry_date,
        );

        return new Response(
          JSON.stringify({
            success: true,
            status: updated.status,
            tier: updated.tier,
            expiryDate: updated.expiry_date,
            message: "Subscription restored",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Validate the receipt with Apple/Google
    const validation = await validateReceipt(receipt, platform);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "INVALID_RECEIPT",
          message: validation.error || "Receipt validation failed",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Perform the migration: mark old user as migrated, transfer subscription to new user
    await markUserMigrated(supabase, existingSubscription.anonymous_user_id, anonymousUserId);

    const newSubscription = await transferSubscription(
      supabase,
      existingSubscription,
      anonymousUserId,
    );

    return new Response(
      JSON.stringify({
        success: true,
        status: newSubscription.status,
        tier: newSubscription.tier,
        expiryDate: newSubscription.expiry_date,
        message: "Subscription restored successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
