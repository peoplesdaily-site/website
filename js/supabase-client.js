// ============================================================
// js/supabase-client.js
// Reusable Supabase client — import this before any other
// JS file that needs database or auth access.
//
// Uses the PUBLIC anon key only. Never put a service-role
// key in frontend code. Row-Level Security on Supabase
// handles all data access control.
// ============================================================

const SUPABASE_URL  = 'https://ulpktvjhxkapdvzaunaa.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGt0dmpoeGthcGR2emF1bmFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODYxMjYsImV4cCI6MjA5MDk2MjEyNn0.ujIg34OVNdUrxEu-W7veN6VFxl_6SixSO_3BW0Xgp_A';

// The Supabase CDN script must be loaded before this file.
// It exposes window.supabase globally.
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
