import * as React from "react"
import { cn } from "@/lib/utils"

const Dialog = ({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) => {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [open])

  // Esc fecha a janela, como o clique fora dela — a menos que um componente
  // de dentro já tenha tratado o Esc (fechar uma lista de sugestões ou um
  // Select marca o evento com preventDefault): aí só a lista fecha.
  React.useEffect(() => {
    if (!open) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onOpenChange(false)
    }
    document.addEventListener("keydown", aoTeclar)
    return () => document.removeEventListener("keydown", aoTeclar)
  }, [open, onOpenChange])

  // Clique FORA do conteúdo fecha. Só conta quando o botão desceu e subiu no
  // fundo: arrastar uma seleção de texto de dentro para fora não fecha. O fundo
  // são as duas camadas (a escura e a que centraliza) — um handler só, na de
  // fora: com um em cada, o mousedown da camada de dentro subia para a de fora
  // e era sobrescrito, e o clique fora nunca fechava.
  const fundo = React.useRef<HTMLDivElement>(null)
  const centro = React.useRef<HTMLDivElement>(null)
  const desceuNoFundo = React.useRef(false)
  const noFundo = (e: React.MouseEvent) => e.target === fundo.current || e.target === centro.current

  if (!open) return null

  return (
    <div
      ref={fundo}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50"
      onMouseDown={(e) => {
        desceuNoFundo.current = noFundo(e)
      }}
      onClick={(e) => {
        if (desceuNoFundo.current && noFundo(e)) onOpenChange(false)
        desceuNoFundo.current = false
      }}
    >
      <div ref={centro} className="flex items-center justify-center min-h-screen px-4 py-8">
        {children}
      </div>
    </div>
  )
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="dialog"
    aria-modal="true"
    className={cn(
      "relative w-full max-w-4xl bg-white rounded-lg shadow-lg",
      className
    )}
    {...props}
  />
))
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 p-6 border-b", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
DialogClose.displayName = "DialogClose"

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose }
