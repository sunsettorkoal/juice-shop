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

const EXPORT_SIGNING_KEY = process.env.EXPORT_SIGNING_KEY ?? crypto.randomBytes(32).toString('hex')

const COLUMNS = ['orderId', 'email', 'totalPrice', 'delivered', 'eta', 'items'] as const

function csvCell (value: unknown): string {
  const text = String(value ?? '')
  const isFormula = /^[=+@]/.test(text) || (/^-/.test(text) && !Number.isFinite(Number(text)))
  const cell = isFormula ? `'${text}` : text
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
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
  const mailbox = email.split('@')[0].replace(/[\\/]/g, '')
  return `orders-${mailbox}-${stamp}.${format}`
}

export function signDownload (fileName: string): string {
  return crypto.createHash('md5').update(EXPORT_SIGNING_KEY + fileName).digest('hex')
}

export function isValidSignature (fileName: string, signature: string): boolean {
  const expected = Buffer.from(signDownload(fileName), 'utf8')
  const provided = Buffer.from(signature, 'utf8')
  if (provided.length !== expected.length) {
    return false
  }
  return crypto.timingSafeEqual(expected, provided)
}
