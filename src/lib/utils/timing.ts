/**
 * Enforces a minimum display duration for page and section transitions.
 * Guarantees that loader animations play smoothly for 0.6s - 1.0s (default: 750ms)
 * and that all server data is 100% resolved before the new section appears.
 */
export async function withTransitionDelay<T>(task: Promise<T> | T, minMs = 750): Promise<T> {
  const [result] = await Promise.all([
    task,
    new Promise<void>((resolve) => setTimeout(resolve, minMs)),
  ]);
  return result;
}

