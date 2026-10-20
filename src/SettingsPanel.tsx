import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AppState, Provider, Settings } from '../shared/types';
import { api } from './bridge';

interface Props {
  state: AppState;
  onSave: (settings: Partial<Settings>) => Promise<Settings>;
  settingsBusy: boolean;
  onPreviewCompanion: () => Promise<void>;
  onKey: (provider: Provider, key: string) => Promise<void>;
  onClose: () => void;
  onDeleteHistory: () => Promise<void>;
  isPreview: boolean;
}
const providerNames: Record<Provider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  gemini: 'Gemini',
};
const shortcutLabels = {
  shortcut: 'Show / hide shortcut',
  captureShortcut: 'Screenshot shortcut',
  newConversationShortcut: 'New conversation shortcut',
} as const;
const shortcutFields = Object.keys(shortcutLabels) as (keyof typeof shortcutLabels)[];
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function SettingsPanel({
  state,
  onSave,
  settingsBusy,
  onPreviewCompanion,
  onKey,
  onClose,
  onDeleteHistory,
  isPreview,
}: Props) {
  const id = useId();
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [provider, setProvider] = useState<Provider>(
    state.settings.mode === 'free' ? 'openrouter' : state.settings.provider,
  );
  const [key, setKey] = useState('');
  const [keyPending, setKeyPending] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [keyNotice, setKeyNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceError, setAppearanceError] = useState('');
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [quitError, setQuitError] = useState('');
  const saveErrorRef = useRef<HTMLParagraphElement>(null);
  const keyErrorRef = useRef<HTMLParagraphElement>(null);
  const appearanceErrorRef = useRef<HTMLParagraphElement>(null);
  const previousSettings = useRef(state.settings);
  const workspaceFields = (Object.keys(draft) as (keyof Settings)[]).filter(
    (name) => name !== 'theme' && name !== 'companionOpacity',
  );
  const dirty = workspaceFields.some((name) => draft[name] !== state.settings[name]);
  const appearanceDirty =
    draft.theme !== state.settings.theme ||
    draft.companionOpacity !== state.settings.companionOpacity;
  const busy = saving || appearanceSaving || settingsBusy;

  useEffect(() => {
    const previous = previousSettings.current;
    previousSettings.current = state.settings;
    // A quick theme change must not erase an unsaved shortcut, prompt, or opacity.
    setDraft((current) => {
      const next = { ...current };
      for (const name of Object.keys(state.settings) as (keyof Settings)[]) {
        if (previous[name] !== state.settings[name])
          Object.assign(next, { [name]: state.settings[name] });
      }
      return next;
    });
  }, [state.settings]);
  useEffect(() => {
    if (saveError) saveErrorRef.current?.focus();
  }, [saveError]);
  useEffect(() => {
    if (keyError) keyErrorRef.current?.focus();
  }, [keyError]);
  useEffect(() => {
    if (appearanceError) appearanceErrorRef.current?.focus();
  }, [appearanceError]);
  function update<K extends keyof Settings>(name: K, value: Settings[K]) {
    setDraft((previous) => ({ ...previous, [name]: value }));
    if (name === 'theme' || name === 'companionOpacity') {
      setAppearanceSaved(false);
      setAppearanceError('');
    } else {
      setSaved(false);
      setSaveError('');
      setFieldErrors({});
    }
  }
  async function saveAppearance(preview: boolean) {
    if (busy || (preview && dirty)) return;
    setAppearanceSaving(true);
    setAppearanceError('');
    setAppearanceSaved(false);
    try {
      await onSave({ theme: draft.theme, companionOpacity: draft.companionOpacity });
      setAppearanceSaved(true);
      if (preview) await onPreviewCompanion();
    } catch (error) {
      setAppearanceError(`Could not save appearance. ${message(error)}`);
    } finally {
      setAppearanceSaving(false);
    }
  }
  async function saveKey(remove = false) {
    if (isPreview || keyPending || (!remove && !key.trim())) return;
    setKeyPending(true);
    setKeyError('');
    setKeyNotice('');
    try {
      await onKey(provider, remove ? '' : key.trim());
      setKey('');
      setKeyNotice(`${providerNames[provider]} key ${remove ? 'removed' : 'saved'}.`);
    } catch (error) {
      setKeyError(message(error));
    } finally {
      setKeyPending(false);
    }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setSaveError('');
    setSaved(false);
    const errors: Record<string, string> = {};
    for (const name of shortcutFields) {
      if (
        !/^(?:(?:Alt|Option|Control|Ctrl|Command|Cmd|CommandOrControl|CmdOrCtrl|Super|Meta|Shift)\+)+[^+]+$/i.test(
          draft[name].trim(),
        )
      ) {
        errors[name] = 'Include a modifier and key, for example Alt+W or Command+J.';
      }
    }
    for (const [index, name] of shortcutFields.entries()) {
      if (
        shortcutFields
          .slice(0, index)
          .some((other) => draft[name].trim().toLowerCase() === draft[other].trim().toLowerCase())
      )
        errors[name] = 'Choose a different shortcut for each action.';
    }
    if (!draft.systemPrompt.trim()) errors.systemPrompt = 'Enter instructions for your assistant.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setSaveError('Check the highlighted settings below.');
      return;
    }
    setSaving(true);
    try {
      const changes: Partial<Settings> = {};
      for (const name of workspaceFields) {
        if (draft[name] !== state.settings[name])
          Object.assign(changes, {
            [name]:
              name === 'shortcut' ||
              name === 'captureShortcut' ||
              name === 'newConversationShortcut'
                ? draft[name].trim()
                : draft[name],
          });
      }
      const validated = await onSave(changes);
      // Canonical shortcuts can equal the previously saved value, so an
      // external-state delta alone cannot reconcile the submitted draft.
      setDraft((current) => {
        const next = { ...current };
        for (const name of workspaceFields) {
          if (name in changes) Object.assign(next, { [name]: validated[name] });
        }
        return next;
      });
      setSaved(true);
    } catch (error) {
      setSaveError(message(error));
    } finally {
      setSaving(false);
    }
  }
  async function deleteHistory() {
    setDeleting(true);
    setHistoryError('');
    try {
      await onDeleteHistory();
      setConfirmDelete(false);
    } catch (error) {
      setHistoryError(message(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <aside className="settings-panel" aria-labelledby={`${id}-heading`}>
      <header className="panel-header">
        <div>
          <h2 id={`${id}-heading`}>Make it yours</h2>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <section className="settings-section" aria-labelledby={`${id}-connections`}>
        <h3 id={`${id}-connections`}>Connections</h3>
        <label className="field" htmlFor={`${id}-provider`}>
          Provider
          <select
            id={`${id}-provider`}
            value={provider}
            disabled={keyPending}
            onChange={(event) => {
              setProvider(event.target.value as Provider);
              setKey('');
              setKeyError('');
              setKeyNotice('');
            }}
          >
            {Object.entries(providerNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="key-status">
          {state.keys[provider] ? 'Key configured' : 'No key saved'}
        </span>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveKey();
          }}
        >
          <label className="field" htmlFor={`${id}-key`}>
            API key
            <input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setKeyError('');
                setKeyNotice('');
              }}
              disabled={isPreview || keyPending}
              placeholder={
                state.keys[provider] ? 'Enter a replacement key' : 'Paste your provider key'
              }
              aria-describedby={`${id}-key-help`}
            />
          </label>
          <p className="field-help" id={`${id}-key-help`}>
            {isPreview
              ? 'Open the desktop app to save API keys.'
              : 'Saved keys are never displayed here. Requests go to your selected provider.'}
          </p>
          <div className="inline-actions">
            <button
              className="secondary-button"
              type="submit"
              disabled={isPreview || keyPending || !key.trim()}
            >
              {keyPending ? 'Updating…' : 'Save key'}
            </button>
            {state.keys[provider] && (
              <button
                className="ghost-button"
                type="button"
                disabled={isPreview || keyPending}
                onClick={() => void saveKey(true)}
              >
                Remove key
              </button>
            )}
          </div>
        </form>
        {keyError && (
          <p className="form-error" ref={keyErrorRef} tabIndex={-1} role="alert">
            {keyError}
          </p>
        )}
        {keyNotice && (
          <p className="field-help" role="status">
            {keyNotice}
          </p>
        )}
        {state.storageNotice && (
          <p className="field-help" role="note">
            {state.storageNotice}
          </p>
        )}
        <p className="field-help">
          Free mode uses OpenRouter's available free models. Provider quotas and capacity apply; a
          key is still required.
        </p>
      </section>
      <section className="settings-section" aria-labelledby={`${id}-appearance`}>
        <h3 id={`${id}-appearance`}>Appearance</h3>
        <label className="field" htmlFor={`${id}-theme`}>
          Theme
          <select
            id={`${id}-theme`}
            value={draft.theme}
            disabled={busy}
            onChange={(event) => update('theme', event.target.value as Settings['theme'])}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Follow system</option>
          </select>
        </label>
        <div className="opacity-field">
          <label htmlFor={`${id}-opacity`}>Companion opacity</label>
          <output htmlFor={`${id}-opacity`}>{Math.round(draft.companionOpacity * 100)}%</output>
          <input
            id={`${id}-opacity`}
            type="range"
            min={85}
            max={100}
            step={1}
            value={Math.round(draft.companionOpacity * 100)}
            disabled={busy || !state.appearanceOpacitySupported}
            aria-valuetext={`${Math.round(draft.companionOpacity * 100)} percent`}
            aria-describedby={`${id}-opacity-help`}
            onChange={(event) => update('companionOpacity', Number(event.target.value) / 100)}
          />
        </div>
        <div className="opacity-scale" aria-hidden="true">
          <span>85% translucent</span>
          <span>100% solid</span>
        </div>
        <p className="field-help" id={`${id}-opacity-help`}>
          {state.appearanceOpacitySupported
            ? 'Only the small companion fades, including its text. This workspace stays solid. Save and preview to see the change.'
            : isPreview
              ? 'Companion translucency is available in Windows and macOS desktop builds. This browser preview stays solid.'
              : 'Companion translucency is available on Windows and macOS. Linux windows stay solid.'}
        </p>
        <div className="appearance-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={busy || !appearanceDirty}
            onClick={() => void saveAppearance(false)}
          >
            {appearanceSaving ? 'Saving…' : 'Save appearance'}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy || dirty}
            aria-describedby={dirty ? `${id}-appearance-preview-help` : undefined}
            onClick={() => void saveAppearance(true)}
          >
            Save &amp; preview companion
          </button>
        </div>
        {dirty && (
          <p className="field-help" id={`${id}-appearance-preview-help`}>
            Save your workspace changes below before opening the companion. You can save appearance
            separately now.
          </p>
        )}
        {appearanceError && (
          <p className="form-error" ref={appearanceErrorRef} tabIndex={-1} role="alert">
            {appearanceError}
          </p>
        )}
        {appearanceSaved && !appearanceDirty && (
          <p className="field-help" role="status">
            Appearance saved.
          </p>
        )}
      </section>
      <form onSubmit={(event) => void saveSettings(event)}>
        <section className="settings-section" aria-labelledby={`${id}-workspace`}>
          <h3 id={`${id}-workspace`}>
            Workspace{' '}
            <span className="key-status">
              {dirty ? 'Unsaved changes' : saved ? 'Saved' : 'Up to date'}
            </span>
          </h3>
          {saveError && (
            <p className="form-error" ref={saveErrorRef} tabIndex={-1} role="alert">
              {saveError}
            </p>
          )}
          {shortcutFields.map((name) => (
            <div key={name}>
              <label className="field" htmlFor={`${id}-${name}`}>
                {shortcutLabels[name]}
                <input
                  id={`${id}-${name}`}
                  value={draft[name]}
                  maxLength={80}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => update(name, event.target.value)}
                  aria-invalid={Boolean(fieldErrors[name])}
                  aria-describedby={`${id}-${name}-help`}
                />
              </label>
              <p
                id={`${id}-${name}-help`}
                className={fieldErrors[name] ? 'form-error' : 'field-help'}
              >
                {fieldErrors[name] ||
                  (name === 'newConversationShortcut'
                    ? 'Opens a fresh companion chat, including when LucentCue is hidden. Use + between keys, e.g. Alt+N.'
                    : 'Use + between keys, e.g. Alt+W or Command+Shift+S.')}
              </p>
            </div>
          ))}
          <label className="toggle-row">
            <span>Keep window on top</span>
            <input
              type="checkbox"
              checked={draft.alwaysOnTop}
              disabled={busy}
              onChange={(event) => update('alwaysOnTop', event.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <span>Show tray icon</span>
            <input
              type="checkbox"
              checked={draft.showTrayIcon}
              disabled={busy}
              aria-describedby={`${id}-tray-help`}
              onChange={(event) => update('showTrayIcon', event.target.checked)}
            />
          </label>
          <p className="field-help" id={`${id}-tray-help`}>
            {draft.showTrayIcon
              ? 'Open or quit LucentCue from the tray menu.'
              : `Use ${draft.shortcut} or launch LucentCue again to restore a hidden window. The app remains visible in Task Manager.`}
          </p>
          <label className="toggle-row">
            <span>Exclude window from screen capture</span>
            <input
              type="checkbox"
              checked={draft.captureProtection}
              disabled={busy || !state.captureProtectionSupported}
              aria-describedby={`${id}-capture-privacy-help`}
              onChange={(event) => update('captureProtection', event.target.checked)}
            />
          </label>
          <p className="field-help" id={`${id}-capture-privacy-help`}>
            {state.captureProtectionNotice}
          </p>
          <label className="toggle-row">
            <span>Save history on this device</span>
            <input
              type="checkbox"
              checked={draft.saveHistory}
              disabled={busy}
              aria-describedby={`${id}-history-help`}
              onChange={(event) => update('saveHistory', event.target.checked)}
            />
          </label>
          <p className="field-help" id={`${id}-history-help`}>
            {draft.saveHistory
              ? 'Recent conversation text is saved on this device. Screenshots stay in memory.'
              : 'Saving with history off removes existing saved history. New conversations will not be stored.'}
          </p>
          <details open={Boolean(fieldErrors.systemPrompt) || undefined}>
            <summary>Advanced instructions</summary>
            <label className="field" htmlFor={`${id}-prompt`}>
              System prompt
              <textarea
                id={`${id}-prompt`}
                rows={5}
                maxLength={12000}
                value={draft.systemPrompt}
                disabled={busy}
                onChange={(event) => update('systemPrompt', event.target.value)}
                aria-invalid={Boolean(fieldErrors.systemPrompt)}
                aria-describedby={fieldErrors.systemPrompt ? `${id}-prompt-error` : undefined}
              />
            </label>
            {fieldErrors.systemPrompt && (
              <p className="form-error" id={`${id}-prompt-error`}>
                {fieldErrors.systemPrompt}
              </p>
            )}
          </details>
          <button className="primary-button" type="submit" disabled={busy || !dirty}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && !dirty && (
            <span className="field-help" role="status">
              Settings saved.
            </span>
          )}
        </section>
      </form>
      <section className="settings-section" aria-labelledby={`${id}-history`}>
        <h3 id={`${id}-history`}>Local history</h3>
        {confirmDelete ? (
          <>
            <p className="field-help">
              Delete all saved conversations on this device? This cannot be undone.
            </p>
            <div className="inline-actions">
              <button
                className="danger-button"
                type="button"
                disabled={deleting}
                onClick={() => void deleteHistory()}
              >
                {deleting ? 'Deleting…' : 'Yes, delete history'}
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            className="danger-button"
            type="button"
            disabled={deleting}
            onClick={() => {
              setConfirmDelete(true);
              setHistoryError('');
            }}
          >
            Delete saved history
          </button>
        )}
        {historyError && (
          <p className="form-error" role="alert">
            {historyError}
          </p>
        )}
      </section>
      <section className="settings-section" aria-label="Application">
        <button
          className="secondary-button"
          type="button"
          disabled={isPreview}
          onClick={() => {
            setQuitError('');
            void api.quit().catch((error) => setQuitError(message(error)));
          }}
        >
          Quit LucentCue
        </button>
        <p className="field-help">
          Close the app completely. Unsaved conversation text will be lost.
        </p>
        {quitError && (
          <p className="form-error" role="alert">
            {quitError}
          </p>
        )}
      </section>
    </aside>
  );
}
