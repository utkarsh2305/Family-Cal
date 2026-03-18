interface SettingsRowProps {
  label: string
  description?: string
  htmlFor?: string
  children: React.ReactNode
}

export default function SettingsRow({ label, description, htmlFor, children }: SettingsRowProps) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-foreground cursor-pointer">
            {label}
          </label>
        ) : (
          <p className="text-[13px] font-semibold text-foreground">{label}</p>
        )}
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
