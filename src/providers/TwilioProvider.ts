import twilio, { Twilio } from 'twilio'
import { CallProvider, CallResult, CallStatus } from '../interfaces/CallProvider'

export class TwilioProvider implements CallProvider {
  private client: Twilio
  private readonly from: string
  private readonly webhookBaseUrl: string

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    this.from        = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || ''
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.BASE_URL || ''
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured')
    }
    if (!this.from) {
      throw new Error('TWILIO_FROM_NUMBER or TWILIO_PHONE_NUMBER must be set')
    }
    this.client = twilio(accountSid, authToken)
  }

  async startOutboundCall(to: string, from: string, metadata: Record<string, any> = {}): Promise<CallResult> {
    const callerId = from || this.from
    const call = await this.client.calls.create({
      to,
      from: callerId,
      url: `${this.webhookBaseUrl}/webhooks/twilio/voice`,
      statusCallback: `${this.webhookBaseUrl}/webhooks/twilio/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
    })
    return {
      callId: metadata.callId ?? call.sid,
      providerCallId: call.sid,
      status: 'INITIATED',
    }
  }

  async hangupCall(callId: string): Promise<void> {
    await this.client.calls(callId).update({ status: 'completed' })
  }

  async muteCall(callId: string): Promise<void> {
    try {
      await this.client.calls(callId).update({ muted: true } as any)
    } catch {
      // mute not supported on all Twilio call states
    }
  }

  async unmuteCall(callId: string): Promise<void> {
    try {
      await this.client.calls(callId).update({ muted: false } as any)
    } catch {
      // unmute not supported on all Twilio call states
    }
  }

  async getCallStatus(callId: string): Promise<CallStatus> {
    const call = await this.client.calls(callId).fetch()
    const statusMap: Record<string, CallStatus> = {
      queued:        'INITIATED',
      initiated:     'INITIATED',
      ringing:       'RINGING',
      'in-progress': 'ANSWERED',
      completed:     'COMPLETED',
      busy:          'FAILED',
      'no-answer':   'NO_ANSWER',
      failed:        'FAILED',
      canceled:      'FAILED',
    }
    return statusMap[call.status] || 'FAILED'
  }
}
