/**
 * Keep the dashboard shell as a layout boundary without adding a second
 * decorative canvas or ambient-orb layer behind the actual business UI.
 */
export function DashboardShellEffects({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
