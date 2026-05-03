"use client";

import { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

// ── Spell: título → descrição → ações em stagger suave ────────────────────────

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 360, damping: 28 },
  },
};

const fadeRight = {
  hidden: { opacity: 0, x: 12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 360, damping: 28 },
  },
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <motion.div
      className="space-y-4"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <motion.h1
            variants={fadeUp}
            className="text-2xl font-bold tracking-tight text-foreground"
          >
            {title}
          </motion.h1>
          {description && (
            <motion.p
              variants={fadeUp}
              className="text-sm text-muted-foreground mt-1 leading-relaxed"
            >
              {description}
            </motion.p>
          )}
        </div>

        {actions && (
          <motion.div
            variants={fadeRight}
            className="ml-4 flex items-center gap-2 shrink-0"
          >
            {actions}
          </motion.div>
        )}
      </div>

      <motion.div variants={fadeUp}>
        <Separator />
      </motion.div>
    </motion.div>
  );
}
