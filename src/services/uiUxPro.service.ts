export type ThemeMode = 'light' | 'dark' | 'neon';
export type DensityMode = 'comfortable' | 'compact';
export type KeyboardShortcutAction =
  | 'mute'
  | 'hold'
  | 'resume'
  | 'hangup'
  | 'openDialer'
  | 'saveDisposition'
  | 'toggleMiniCallBar';

export interface UiUxPreferenceState {
  themeMode: ThemeMode;
  densityMode: DensityMode;
  miniCallBarEnabled: boolean;
  keyboardShortcutsEnabled: boolean;
  confettiEnabled: boolean;
  leaderboardCelebrationsEnabled: boolean;
  updatedAt: string;
}

export interface KeyboardShortcutConfig {
  action: KeyboardShortcutAction;
  label: string;
  shortcut: string;
  enabled: boolean;
  scope: 'global' | 'call' | 'agent';
}

export interface CelebrationEvent {
  id: string;
  type: 'SALE' | 'CONVERSION' | 'CALL_CONNECTED' | 'CAMPAIGN_GOAL';
  title: string;
  message: string;
  createdAt: string;
  triggeredBy?: string;
}

export interface MiniCallBarState {
  enabled: boolean;
  activeCallId: number | null;
  phoneNumber: string | null;
  contactName: string | null;
  callStatus: 'IDLE' | 'RINGING' | 'CONNECTED' | 'ON_HOLD' | 'ENDED';
  startedAt: string | null;
  durationSeconds: number;
  muted: boolean;
  onHold: boolean;
}

const defaultPreferences: UiUxPreferenceState = {
  themeMode: 'light',
  densityMode: 'comfortable',
  miniCallBarEnabled: true,
  keyboardShortcutsEnabled: true,
  confettiEnabled: true,
  leaderboardCelebrationsEnabled: true,
  updatedAt: new Date().toISOString(),
};

const defaultShortcuts: KeyboardShortcutConfig[] = [
  { action: 'mute', label: 'Mute / Unmute current call', shortcut: 'Ctrl+M', enabled: true, scope: 'call' },
  { action: 'hold', label: 'Hold current call', shortcut: 'Ctrl+H', enabled: true, scope: 'call' },
  { action: 'resume', label: 'Resume held call', shortcut: 'Ctrl+R', enabled: true, scope: 'call' },
  { action: 'hangup', label: 'Hang up current call', shortcut: 'Ctrl+Shift+H', enabled: true, scope: 'call' },
  { action: 'openDialer', label: 'Open Dialer', shortcut: 'Ctrl+D', enabled: true, scope: 'global' },
  { action: 'saveDisposition', label: 'Save disposition', shortcut: 'Ctrl+Enter', enabled: true, scope: 'agent' },
  { action: 'toggleMiniCallBar', label: 'Toggle mini call bar', shortcut: 'Ctrl+B', enabled: true, scope: 'global' },
];

let preferences: UiUxPreferenceState = { ...defaultPreferences };
let shortcuts: KeyboardShortcutConfig[] = [...defaultShortcuts];
const celebrations: CelebrationEvent[] = [];

let miniCallBar: MiniCallBarState = {
  enabled: true,
  activeCallId: null,
  phoneNumber: null,
  contactName: null,
  callStatus: 'IDLE',
  startedAt: null,
  durationSeconds: 0,
  muted: false,
  onHold: false,
};

const nowIso = () => new Date().toISOString();

const calculateDuration = (startedAt: string | null): number => {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
};

export const uiUxProService = {
  getOverview() {
    return {
      preferences,
      shortcuts,
      miniCallBar: {
        ...miniCallBar,
        durationSeconds: calculateDuration(miniCallBar.startedAt),
      },
      celebrations: celebrations.slice(0, 20),
      availableThemes: [
        {
          id: 'light',
          name: 'Light',
          description: 'Clean production theme for office usage.',
        },
        {
          id: 'dark',
          name: 'Dark',
          description: 'Low-light dashboard theme for long calling sessions.',
        },
        {
          id: 'neon',
          name: 'Neon / Cyberpunk',
          description: 'High-energy PTDT demo theme for sales floors and client demos.',
        },
      ],
      featureReadiness: {
        neonTheme: true,
        miniCallBar: true,
        keyboardShortcuts: true,
        confettiCelebrations: true,
        leaderboardCelebrations: true,
      },
    };
  },

  updatePreferences(input: Partial<UiUxPreferenceState>) {
    const next: UiUxPreferenceState = {
      ...preferences,
      ...input,
      themeMode: input.themeMode ?? preferences.themeMode,
      densityMode: input.densityMode ?? preferences.densityMode,
      updatedAt: nowIso(),
    };

    if (!['light', 'dark', 'neon'].includes(next.themeMode)) {
      throw new Error('Invalid themeMode. Use light, dark, or neon.');
    }

    if (!['comfortable', 'compact'].includes(next.densityMode)) {
      throw new Error('Invalid densityMode. Use comfortable or compact.');
    }

    preferences = next;
    miniCallBar.enabled = next.miniCallBarEnabled;
    return preferences;
  },

  getShortcuts() {
    return shortcuts;
  },

  updateShortcuts(nextShortcuts: KeyboardShortcutConfig[]) {
    if (!Array.isArray(nextShortcuts)) {
      throw new Error('shortcuts must be an array.');
    }

    const validActions = new Set(defaultShortcuts.map((item) => item.action));
    shortcuts = nextShortcuts
      .filter((item) => item && validActions.has(item.action))
      .map((item) => ({
        action: item.action,
        label: item.label || defaultShortcuts.find((shortcut) => shortcut.action === item.action)?.label || item.action,
        shortcut: item.shortcut || '',
        enabled: Boolean(item.enabled),
        scope: item.scope || 'global',
      }));

    return shortcuts;
  },

  getMiniCallBar() {
    return {
      ...miniCallBar,
      durationSeconds: calculateDuration(miniCallBar.startedAt),
    };
  },

  updateMiniCallBar(input: Partial<MiniCallBarState>) {
    miniCallBar = {
      ...miniCallBar,
      ...input,
      enabled: typeof input.enabled === 'boolean' ? input.enabled : miniCallBar.enabled,
      durationSeconds: calculateDuration(input.startedAt ?? miniCallBar.startedAt),
    };

    if (miniCallBar.callStatus === 'CONNECTED' && !miniCallBar.startedAt) {
      miniCallBar.startedAt = nowIso();
    }

    if (miniCallBar.callStatus === 'ENDED' || miniCallBar.callStatus === 'IDLE') {
      miniCallBar.startedAt = null;
      miniCallBar.durationSeconds = 0;
      miniCallBar.activeCallId = null;
      miniCallBar.phoneNumber = null;
      miniCallBar.contactName = null;
      miniCallBar.muted = false;
      miniCallBar.onHold = false;
    }

    return this.getMiniCallBar();
  },

  triggerCelebration(input: Partial<CelebrationEvent>) {
    const event: CelebrationEvent = {
      id: `celebration_${Date.now()}`,
      type: input.type || 'CONVERSION',
      title: input.title || 'Conversion captured',
      message: input.message || 'Great work! A positive outcome was recorded.',
      createdAt: nowIso(),
      triggeredBy: input.triggeredBy,
    };

    celebrations.unshift(event);
    if (celebrations.length > 50) celebrations.pop();
    return event;
  },

  clearCelebrations() {
    celebrations.splice(0, celebrations.length);
    return { cleared: true, clearedAt: nowIso() };
  },
};
