import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';

// Public, unauthenticated health probe. Returns only booleans + status strings —
// never secrets, connection strings, or key values.
export const dynamic = 'force-dynamic';

export async function GET() {
  let database = 'disconnected';
  try {
    await dbConnect();
    database = mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected';
  } catch {
    database = 'error';
  }

  const cloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
  const openAIConfigured = Boolean(process.env.OPENAI_API_KEY);
  const authConfigured = Boolean(process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_URL);

  const status = database === 'connected' ? 'ok' : 'degraded';

  // Which commit is actually serving. Vercel injects this at build time, so it
  // answers "did my push deploy, or is the old build still live?" — the previous
  // deployment keeps serving when a build fails, which otherwise looks identical
  // to a successful one.
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);

  return NextResponse.json(
    {
      status,
      database,
      commit,
      cloudinaryConfigured,
      openAIConfigured,
      authConfigured,
      timestamp: new Date().toISOString(),
    },
    { status: status === 'ok' ? 200 : 503 },
  );
}
