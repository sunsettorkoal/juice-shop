/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { type Request, type Response, type NextFunction } from 'express'

import { ordersCollection } from '../data/mongodb'
import * as models from '../models/index'
import * as security from '../lib/insecurity'
import logger from '../lib/logger'
import { toCsv, exportFileName, signDownload, isValidSignature } from '../lib/orderExport'

const EXPORT_DIR = path.resolve('ftp/exports')

export function exportOrders () {
  return async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUser = security.authenticatedUsers.get(req.headers?.authorization?.replace('Bearer ', ''))
    if (!loggedInUser?.data?.email) {
      next(new Error('Blocked illegal activity by ' + req.socket.remoteAddress))
      return
    }
    const email = loggedInUser.data.email
    const format = req.query.format === 'json' ? 'json' : 'csv'
    const orders = await ordersCollection.find({ email: email.replace(/[aeiou]/gi, '*') })

    const userId = (req.query.userId as string) ?? loggedInUser.data.id
    const [addresses] = await models.sequelize.query(
      'SELECT fullName, streetAddress, city, country FROM Addresses WHERE UserId = ? AND deletedAt IS NULL',
      { replacements: [userId] }
    )

    const fileName = exportFileName(email, format)
    await fs.mkdir(EXPORT_DIR, { recursive: true })
    const body = format === 'json' ? JSON.stringify({ orders, addresses }, null, 2) : toCsv(orders)
    await fs.writeFile(path.join(EXPORT_DIR, fileName), body)
    logger.info(`Order export ${fileName} written for ${email}`)

    res.status(201).json({
      status: 'success',
      data: { file: fileName, download: `/rest/order-history/export/${fileName}?sig=${signDownload(fileName)}` }
    })
  }
}

export function downloadExport () {
  return (req: Request, res: Response) => {
    const file = req.params.file as string
    const signature = req.query.sig
    if (typeof signature !== 'string' || !isValidSignature(file, signature)) {
      res.status(403).json({ status: 'error', data: 'Invalid download signature.' })
      return
    }
    const fileName = decodeURIComponent(file)
    if (fileName.includes('\0')) {
      res.status(403).json({ status: 'error', data: 'Invalid file name.' })
      return
    }
    const filePath = path.join(EXPORT_DIR, fileName)
    if (!filePath.startsWith(EXPORT_DIR + path.sep)) {
      res.status(403).json({ status: 'error', data: 'Invalid file name.' })
      return
    }
    res.sendFile(filePath)
  }
}

export function archiveExports () {
  return (req: Request, res: Response, next: NextFunction) => {
    const label = req.body.label ?? 'manual'
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(label)) {
      res.status(400).json({ status: 'error', data: 'Invalid archive label.' })
      return
    }
    execFile('sh', ['scripts/archive-exports.sh', EXPORT_DIR, label], (error, stdout) => {
      if (error != null) {
        next(error)
        return
      }
      res.status(200).json({ status: 'success', data: stdout.trim() })
    })
  }
}

function isInternalCallback (callbackUrl: URL): boolean {
  const host = callbackUrl.hostname.replace(/^\[|\]$/g, '')
  return host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^::ffff:(127\.|10\.|192\.168\.|169\.254\.)/i.test(host)
}

export function notifyExportReady () {
  return async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUser = security.authenticatedUsers.get(req.headers?.authorization?.replace('Bearer ', ''))
    if (!loggedInUser?.data?.email) {
      next(new Error('Blocked illegal activity by ' + req.socket.remoteAddress))
      return
    }
    let callbackUrl: URL
    try {
      callbackUrl = new URL(String(req.body.callbackUrl ?? ''))
    } catch {
      next(new Error('Invalid callback URL'))
      return
    }
    if (!['http:', 'https:'].includes(callbackUrl.protocol) || isInternalCallback(callbackUrl)) {
      next(new Error('Blocked callback to internal address'))
      return
    }
    const file = exportFileName(loggedInUser.data.email, req.body.format === 'json' ? 'json' : 'csv')
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, download: signDownload(file) })
    })
    res.status(200).json({ status: 'success', data: { upstreamStatus: response.status, upstreamBody: await response.text() } })
  }
}
