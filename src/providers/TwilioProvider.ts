import twilio, { Twilio } from 'twilio'
import { CallProvider, CallResult, CallStatus } from '../interfaces/CallProvider'

/**
 * TwilioProvider encapsulates all interactions with the Twilio SDK.
 * It implements the CallProvider interface so the rest of the
 * application can remain agnostic to the underlying telephony vendor.
 */
export class TwilioProvider implements CallProvider {
  private client: Twilio
  private readonly from: string
  private readonly webhookBaseUrl: string

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    this.from        = process.env.TWILIO_FROM_NUMBER || ''
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || ''
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured')
    }
    if (!this.from) {
      throw new Error('TWILIO_FROM_NUMBER must be set')
    }
    this.client = twilio(accountSid, authToken)
  }

  /**
   * Initiate an outbound call via Twilio. Uses the WEBHOOK_BASE_URL
   * environment variable to construct status and voice webhook URLs.
   */
  async startOutboundCall(to: string, from: string, metadata: Record<string, any> = {}): Promise<CallResult> {
    const callerId = from || this.from
    const call = await this.client.calls.create({
      to,
      from: callerId,
      url: `${this.webhookBaseUrl}/webhooks/twilio/voice`,
      statusCallback: `${this.webhookBaseUrl}/webhooks/twilio/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated','ringing','answered','completed'],
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
    // Twilio does not support muting an individual call directly outside of a conference.
    // For softphone scenarios you should create a conference and mute a participant.
    // Here we attempt to set the call to muted via the API; if unsupported it will be ignored.
    try {
      await this.client.calls(callId).update({ muted: true } as any)
    } catch (err) {
      // Swallow errors to avoid crashing the dialer. Logging could be added here.
    }
  }

  async unmuteCall(callId: string): Promise<void> {
    try {
      await this.client.calls(callId).update({ muted: false } as any)
    } catch (err) {
      // Swallow errors to avoid crashing the dialer.
    }
  }

  async getCallStatus(callId: string): Promise<CallStatus> {
    const call = await this.client.calls(callId).fetch()
    // Map Twilio call statuses to our CallStatus type
    const statusMap: Record<string, CallStatus> = {
      queued: 'INITIATED',
      ringing: 'RINGING',
      in-progress: 'ANSWERED',
      completed: 'COMPLETED',
      busy: 'FAILED',
      no-answer: 'NO_ANSWER',
      failed: 'FAILED',
      canceled: 'FAILED',
    }
    return statusMap[call.status] || 'FAILED'
  }
}