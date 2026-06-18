import { Request, Response, NextFunction } from 'express'
import {
  createRetellOutboundPhoneCall,
  RetellServiceError,
} from '../services/retell.service'

function maskPhoneNumber(phoneNumber?: string) {
  if (!phoneNumber) return null
  return phoneNumber.replace(/^(\+\d{2})(\d+)(\d{3})$/, (_match, prefix, middle, suffix) => {
    return `${prefix}${'*'.repeat(String(middle).length)}${suffix}`
  })
}

function getStringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function assertTestEndpointEnabled(req: Request) {
  if (process.env.RETELL_TEST_OUTBOUND_ENABLED !== 'true') {
    throw new RetellServiceError('Retell test outbound endpoint is disabled', 403)
  }

  const expectedSecret = process.env.AI_CALLS_TEST_SECRET

  if (!expectedSecret) {
    throw new RetellServiceError('AI_CALLS_TEST_SECRET is not configured', 500)
  }

  const providedSecret = req.header('X-PTDT-AI-Test-Secret')

  if (providedSecret !== expectedSecret) {
    throw new RetellServiceError('Unauthorized AI call test request', 401)
  }
}

export async function testOutboundAiCall(req: Request, res: Response, next: NextFunction) {
  try {
    assertTestEndpointEnabled(req)

    const toNumber = getStringField(req.body?.toNumber)
    const overrideAgentId = getStringField(req.body?.overrideAgentId)

    const response = await createRetellOutboundPhoneCall({
      toNumber,
      overrideAgentId: overrideAgentId || undefined,
      metadata: {
        source: 'ptdt_backend_test',
        sprint: 'phase5_sprint2_retell_backend_trigger',
        requested_at: new Date().toISOString(),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Retell outbound AI call triggered',
      provider: 'retell',
      retellCallId: response.call_id || null,
      callStatus: response.call_status || null,
      callType: response.call_type || null,
      direction: response.direction || null,
      fromNumber: response.from_number || process.env.RETELL_FROM_NUMBER || null,
      toNumber: response.to_number || toNumber,
      maskedToNumber: maskPhoneNumber(response.to_number || toNumber),
      agentId: response.agent_id || null,
      agentName: response.agent_name || null,
      agentVersion: response.agent_version || null,
      telephonyIdentifier: response.telephony_identifier || null,
    })
  } catch (error) {
    if (error instanceof RetellServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        provider: 'retell',
        statusCode: error.statusCode,
        details: error.payload || null,
      })
      return
    }

    next(error)
  }
}
