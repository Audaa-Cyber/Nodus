export type NotificationItem = {
  id: string;
  recipient_user_id: string;
  business_id: string;
  type: string;
  title: string;
  message: string;
  invoice_id: string | null;
  destination_url: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationChange = {
  eventType: "INSERT" | "UPDATE";
  item: NotificationItem;
};

export type NotificationState = {
  items: NotificationItem[];
  unreadCount: number;
};

const MAX_NOTIFICATIONS = 20;
const unread = (item: NotificationItem) => item.read_at === null;

function sortedItems(items: Map<string, NotificationItem>) {
  return [...items.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_NOTIFICATIONS);
}

export function applyNotificationChange(
  state: NotificationState,
  change: NotificationChange,
): NotificationState {
  const previous = state.items.find((item) => item.id === change.item.id);
  if (!previous) {
    if (change.eventType !== "INSERT") return state;
    const items = new Map(state.items.map((item) => [item.id, item]));
    items.set(change.item.id, change.item);
    return {
      items: sortedItems(items),
      unreadCount: state.unreadCount + (unread(change.item) ? 1 : 0),
    };
  }

  const items = new Map(state.items.map((item) => [item.id, item]));
  items.set(change.item.id, { ...previous, ...change.item });
  return {
    items: sortedItems(items),
    unreadCount: Math.max(0, state.unreadCount + Number(unread(change.item)) - Number(unread(previous))),
  };
}

export function mergeNotificationSnapshot(
  snapshotItems: NotificationItem[],
  snapshotUnreadCount: number,
  liveChanges: NotificationChange[],
): NotificationState {
  const items = new Map(snapshotItems.map((item) => [item.id, item]));
  const latestChanges = new Map<string, NotificationChange>();
  for (const change of liveChanges) {
    const previous = latestChanges.get(change.item.id);
    latestChanges.set(change.item.id, {
      eventType: previous?.eventType === "INSERT" ? "INSERT" : change.eventType,
      item: change.item,
    });
  }

  for (const change of latestChanges.values()) {
    const snapshotItem = items.get(change.item.id);
    if (!snapshotItem) {
      if (change.eventType === "INSERT") {
        items.set(change.item.id, change.item);
      }
      continue;
    }
    items.set(change.item.id, { ...snapshotItem, ...change.item });
  }

  return { items: sortedItems(items), unreadCount: Math.max(0, snapshotUnreadCount) };
}
