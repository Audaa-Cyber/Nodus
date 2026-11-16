export type InvoiceRealtimeUpdate = {
  id: string;
  business_id: string;
  invoice_number?: string;
  status: string;
  amount_minor?: number;
  currency?: string;
  due_date?: string | null;
};

export type InvoiceRealtimeRow = {
  id: string;
  status: string;
  amount_minor: number;
  currency: string;
  due_date: string | null;
};

export function applyInvoiceUpdate<T extends InvoiceRealtimeRow>(rows: T[], update: InvoiceRealtimeUpdate): T[] {
  return rows.map((row) => row.id === update.id ? ({
    ...row,
    status: update.status || row.status,
    amount_minor: update.amount_minor ?? row.amount_minor,
    currency: update.currency ?? row.currency,
    due_date: update.due_date !== undefined ? update.due_date : row.due_date,
  } as T) : row);
}

export function mergeInvoiceSnapshot<T extends InvoiceRealtimeRow>(
  snapshotRows: T[],
  latestUpdates: Map<string, InvoiceRealtimeUpdate>,
): T[] {
  return snapshotRows.map((row) => {
    const update = latestUpdates.get(row.id);
    if (!update || update.status === row.status) return row;
    return applyInvoiceUpdate([row], update)[0];
  });
}
