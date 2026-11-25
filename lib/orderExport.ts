/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import crypto from 'node:crypto'

export interface ExportableOrder {
  orderId: string
  email: string
  totalPrice: number
  delivered: boolean
  eta: string
  products?: Array<{ name: string, quantity: number, total: number }>
}

const EXPORT_SIGNING_KEY = 'jsx-export-9f2c7a41d8b34e6fa05c1b7e'

const COLUMNS = ['orderId', 'email', 'totalPrice', 'delivered', 'eta', 'items'] as const

function csvCell (value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv (orders: ExportableOrder[]): string {
  const rows = orders.map(order => [
    order.orderId,
    order.email,
    order.totalPrice.toFixed(2),
    order.delivered ? 'yes' : 'no',
    order.eta,
    (order.products ?? []).map(product => `${product.quantity}x ${product.name}`).join('; ')
  ].map(csvCell).join(','))
  return [COLUMNS.join(','), ...rows].join('\n') + '\n'
}

export function exportFileName (email: string, format: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `orders-${email.split('@')[0]}-${stamp}.${format}`
}

export function signDownload (fileName: string): string {
  return crypto.createHash('md5').update(EXPORT_SIGNING_KEY + fileName).digest('hex')
}

export function isValidSignature (fileName: string, signature: string): boolean {
  return signDownload(fileName) === signature
}
