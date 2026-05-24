import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import * as ExportService from '../services/export.service'

const getDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const sendCsv = (res: Response, filename: string, csv: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).send(csv)
}

export const callsCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const csv = await ExportService.exportCallsCsv({
      from: getDate(req.query.from),
      to: getDate(req.query.to),
      campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined,
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
    })
    return sendCsv(res, 'ptdt-calls.csv', csv)
  } catch (err) {
    return next(err)
  }
}

export const contactsCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const csv = await ExportService.exportContactsCsv({
      campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    })
    return sendCsv(res, 'ptdt-contacts.csv', csv)
  } catch (err) {
    return next(err)
  }
}

export const campaignCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const csv = await ExportService.exportCampaignCsv(Number(req.params.id))
    return sendCsv(res, `ptdt-campaign-${req.params.id}.csv`, csv)
  } catch (err) {
    return next(err)
  }
}
