import mongoose from 'mongoose';

let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

export default async function dbConnect() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('Please define MONGODB_URI in .env.local');

  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false }).then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
