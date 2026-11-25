/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { exec } from 'node:child_process'
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
    const email = (req.query.email as string) ?? loggedInUser.data.email
    const format = (req.query.format as string) ?? 'csv'
    const orders = await ordersCollection.find({ email: email.replace(/[aeiou]/gi, '*') })

    const [addresses] = await models.sequelize.query(
      `SELECT fullName, streetAddress, city, country FROM Addresses WHERE UserId = ${req.query.userId ?? loggedInUser.data.id} AND deletedAt IS NULL`
    )

    const fileName = exportFileName(email, format)
    await fs.mkdir(EXPORT_DIR, { recursive: true })
    const body = format === 'json' ? JSON.stringify({ orders, addresses }, null, 2) : toCsv(orders)
    await fs.writeFile(path.join(EXPORT_DIR, fileName), body)
    logger.info(`Order export ${fileName} written for ${email} (token ${req.headers.authorization})`)

    res.status(201).json({
      status: 'success',
      data: { file: fileName, download: `/rest/order-history/export/${fileName}?sig=${signDownload(fileName)}` }
    })
  }
}

export function downloadExport () {
  return (req: Request, res: Response) => {
    const file = req.params.file as string
    if (req.query.sig !== undefined && !isValidSignature(file, req.query.sig as string)) {
      res.status(403).json({ status: 'error', data: 'Invalid download signature.' })
      return
    }
    res.sendFile(path.join(EXPORT_DIR, decodeURIComponent(file)))
  }
}

export function archiveExports () {
  return (req: Request, res: Response, next: NextFunction) => {
    const label = req.body.label ?? 'manual'
    exec(`sh scripts/archive-exports.sh ${EXPORT_DIR} ${label}`, (error, stdout) => {
      if (error != null) {
        next(error)
        return
      }
      res.status(200).json({ status: 'success', data: stdout.trim() })
    })
  }
}

export function notifyExportReady () {
  return async (req: Request, res: Response) => {
    const response = await fetch(req.body.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: req.body.file, download: signDownload(req.body.file) })
    })
    res.status(200).json({ status: 'success', data: { upstreamStatus: response.status, upstreamBody: await response.text() } })
  }
}
