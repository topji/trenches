export function InlineError({ children, id }: { children: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-small text-loss mt-2">
      {children}
    </p>
  );
}
