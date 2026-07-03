import { type KeyboardEvent, type ReactNode, useId, useState } from 'react'

export function AnimatedDisclosure({
  children,
  childrenClassName = '',
  className = '',
  defaultOpen = false,
  header,
  headerClassName = '',
  headerMode = 'button',
  onOpenChange,
  open,
}: AnimatedDisclosureProps) {
  let id = useId()
  let [localOpen, setLocalOpen] = useState(defaultOpen)
  let isOpen = open ?? localOpen

  function toggle() {
    let next = !isOpen
    if (open === undefined) setLocalOpen(next)
    onOpenChange?.(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    toggle()
  }

  let headerProps = {
    'aria-controls': id,
    'aria-expanded': isOpen,
    className: headerClassName,
    onClick: toggle,
  }

  return (
    <section className={className}>
      {headerMode === 'button' ? (
        <button {...headerProps} type="button">
          {header}
        </button>
      ) : (
        <div
          {...headerProps}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          {header}
        </div>
      )}

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        id={id}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={childrenClassName}>{children}</div>
        </div>
      </div>
    </section>
  )
}

type AnimatedDisclosureProps = {
  children: ReactNode
  childrenClassName?: string
  className?: string
  defaultOpen?: boolean
  header: ReactNode
  headerClassName?: string
  headerMode?: 'button' | 'div'
  onOpenChange?: (open: boolean) => void
  open?: boolean
}
