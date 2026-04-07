'use client'

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"

// Re-export standard table parts for convenience
export {
  Table,
  TableHeader as TableHead,
  TableBody,
  TableRow as Tr,
  TableHead as Th,
  TableCell as Td,
}

/** Two-line cell: bold title + optional subtitle */
export function TitleCell({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  )
}

/** Full-width empty-state row */
export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}

/** Joined button-group pagination */
interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
}

export function Pagination({ total, page, pageSize, onPage }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between mt-4 pt-4">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center rounded-md border border-border overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-none border-r border-border h-8 px-3 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Previous
        </Button>
        <span className="h-8 px-3 flex items-center text-sm text-muted-foreground border-r border-border">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="rounded-none h-8 px-3 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
