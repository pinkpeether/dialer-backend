export const AUDIT_ACTIONS = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',

  SETTINGS_UPDATE: 'settings.update',

  AGENT_CREATE: 'agent.create',
  AGENT_UPDATE: 'agent.update',
  AGENT_DELETE: 'agent.delete',
  AGENT_STATUS_UPDATE: 'agent.status.update',

  CAMPAIGN_CREATE: 'campaign.create',
  CAMPAIGN_UPDATE: 'campaign.update',
  CAMPAIGN_STATUS_UPDATE: 'campaign.status.update',
  CAMPAIGN_DELETE: 'campaign.delete',

  CONTACT_CREATE: 'contact.create',
  CONTACT_UPDATE: 'contact.update',
  CONTACT_DELETE: 'contact.delete',
  CONTACT_IMPORT: 'contact.import',

  CALL_CREATE: 'call.create',
  CALL_END: 'call.end',
  CALL_DISPOSITION_UPDATE: 'call.disposition.update',

  CALLBACK_CREATE: 'callback.create',
  CALLBACK_UPDATE: 'callback.update',
  CALLBACK_CANCEL: 'callback.cancel',
  CALLBACK_COMPLETE: 'callback.complete',

  DNC_ADD: 'dnc.add',
  DNC_REMOVE: 'dnc.remove',
} as const

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS]
