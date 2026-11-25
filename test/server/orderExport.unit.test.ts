/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toCsv, exportFileName, signDownload, isValidSignature } from '../../lib/orderExport'

const order = { orderId: 'ab12-cd34', email: 'j*m@j**c*-sh.*p', totalPrice: 8.5, delivered: false, eta: '2' }

void describe('orderExport', () => {
  void describe('toCsv', () => {
    void it('writes a header row and one row per order', () => {
      assert.equal(toCsv([order]), 'orderId,email,totalPrice,delivered,eta,items\nab12-cd34,j*m@j**c*-sh.*p,8.50,no,2,\n')
    })

    void it('lists the ordered products in the items column', () => {
      const csv = toCsv([{ ...order, products: [{ name: 'Apple Juice', quantity: 2, total: 3.98 }, { name: 'Banana Juice', quantity: 1, total: 1.99 }] }])
      assert.ok(csv.endsWith(',2x Apple Juice; 1x Banana Juice\n'))
    })

    void it('quotes cells that contain commas or quotes', () => {
      const csv = toCsv([{ ...order, products: [{ name: 'Juice, "extra" pulp', quantity: 1, total: 2 }] }])
      assert.ok(csv.endsWith(',"1x Juice, ""extra"" pulp"\n'))
    })
  })

  void describe('exportFileName', () => {
    void it('is built from the mailbox name, the date and the format', () => {
      assert.match(exportFileName('jim@juice-sh.op', 'csv'), /^orders-jim-\d{4}-\d{2}-\d{2}\.csv$/)
    })
  })

  void describe('signDownload', () => {
    void it('accepts its own signature and rejects another file\'s', () => {
      assert.ok(isValidSignature('orders-jim.csv', signDownload('orders-jim.csv')))
      assert.ok(!isValidSignature('orders-bender.csv', signDownload('orders-jim.csv')))
    })
  })
})
