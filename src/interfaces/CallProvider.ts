export type CallStatus = 'INITIATED' | 'RINGING' | 'ANSWERED' | 'NO_ANSWER' | 'FAILED' | 'COMPLETED'

export type CallResult = {
  callId: string
  providerCallId?: string
  status: CallStatus
}

export type StartOutboundCallMetadata = {
  callId?: string
  campaignId?: number
  contactId?: number
  agentId?: number | null
  callerId?: string | null
}

export interface CallProvider {
  startOutboundCall(to: string, from: string, metadata?: StartOutboundCallMetadata): Promise<CallResult>
  hangupCall(callId: string): Promise<void>
  muteCall(callId: string): Promise<void>
  unmuteCall(callId: string): Promise<void>
  getCallStatus(callId: string): Promise<CallStatus>
}