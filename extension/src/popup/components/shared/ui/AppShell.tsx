export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-background text-foreground font-sans antialiased select-none">
      {children}
    </div>
  )
}
