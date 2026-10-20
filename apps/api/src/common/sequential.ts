/**
 * Runs tasks one after another and returns their results as a tuple.
 *
 * Inside an interactive transaction every query shares one connection, so `Promise.all` gains no
 * parallelism — it only makes `pg` queue concurrent queries on a busy client, which is deprecated
 * and removed in pg 9. Use this instead of `Promise.all` for queries on a transaction client.
 */
export async function inSequence<const T extends readonly (() => unknown)[]>(
  ...tasks: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
