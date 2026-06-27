import { getDb } from './mongo';

export const GUEST_REQUEST_LIMIT = Number(process.env.GUEST_REQUEST_LIMIT) || 20;

function guestUsage() {
  return getDb().collection('guest_usage');
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface GuestUsageInfo {
  used: number;
  remaining: number;
  limit: number;
}

export async function initGuestUsageIndexes(): Promise<void> {
  await guestUsage().createIndex({ ip: 1, day: 1 }, { unique: true });
}

export async function getGuestUsage(ip: string): Promise<GuestUsageInfo> {
  const day = todayKey();
  const row = await guestUsage().findOne({ ip, day });
  const used = row?.count ?? 0;
  return {
    used,
    remaining: Math.max(0, GUEST_REQUEST_LIMIT - used),
    limit: GUEST_REQUEST_LIMIT,
  };
}

export async function consumeGuestRequest(ip: string): Promise<GuestUsageInfo> {
  const day = todayKey();
  const result = await guestUsage().findOneAndUpdate(
    { ip, day },
    {
      $inc: { count: 1 },
      $setOnInsert: { ip, day, createdAt: new Date().toISOString() },
      $set: { updatedAt: new Date().toISOString() },
    },
    { upsert: true, returnDocument: 'after' }
  );

  const used = result?.count ?? 1;
  if (used > GUEST_REQUEST_LIMIT) {
    await guestUsage().updateOne({ ip, day }, { $inc: { count: -1 } });
    return {
      used: GUEST_REQUEST_LIMIT,
      remaining: 0,
      limit: GUEST_REQUEST_LIMIT,
    };
  }

  return {
    used,
    remaining: Math.max(0, GUEST_REQUEST_LIMIT - used),
    limit: GUEST_REQUEST_LIMIT,
  };
}
