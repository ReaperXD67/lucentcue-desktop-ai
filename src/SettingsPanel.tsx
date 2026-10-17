import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AppState, Provider, Settings } from '../shared/types';

interface Props {
  state: AppState;
  onSave: (settings: Settings) => Promise<void>;
  onKey: (provider: Provider, key: string) => Promise<void>;
  onClose: () => void;
  onDeleteHistory: () => Promise<void>;
  isPreview: boolean;
}
const providerNames: Record<Provider, string> = { openrouter: 'OpenRouter', openai: 'OpenAI', gemini: 'Gemini' };
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function SettingsPanel({ state, onSave, onKey, onClose, onDeleteHistory, isPreview }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [provider, setProvider] = useState<Provider>(state.settings.mode === 'free' ? 'openrouter' : state.settings.provider);
  const [key, setKey] = useState('');
  const [keyPending, setKeyPending] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [keyNotice, setKeyNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const saveErrorRef = useRef<HTMLParagraphElement>(null);
  const keyErrorRef = useRef<HTMLParagraphElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);

  useEffect(() => { setDraft(state.settings); }, [state.settings]);
  useEffect(() => { if (saveError) saveErrorRef.current?.focus(); }, [saveError]);
  useEffect(() => { if (keyError) keyErrorRef.current?.focus(); }, [keyError]);
  function update<K extends keyof Settings>(name: K, value: Settings[K]) {
    setDraft(previous => ({ ...previous, [name]: value }));
    setSaved(false); setSaveError(''); setFieldErrors({});
  }
  async function saveKey(remove = false) {
    if (isPreview || keyPending || (!remove && !key.trim())) return;
    setKeyPending(true); setKeyError(''); setKeyNotice('');
    try {
      await onKey(provider, remove ? '' : key.trim());
      setKey(''); setKeyNotice(`${providerNames[provider]} key ${remove ? 'removed' : 'saved'}.`);
    } catch (error) { setKeyError(message(error)); }
    finally { setKeyPending(false); }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault(); setSaveError(''); setSaved(false);
    const errors: Record<string, string> = {};
    for (const name of ['shortcut', 'captureShortcut'] as const) {
      if (!/^(?:(?:Alt|Option|Control|Ctrl|Command|Cmd|CommandOrControl|CmdOrCtrl|Super|Meta|Shift)\+)+[^+]+$/i.test(draft[name].trim())) {
        errors[name] = 'Include a modifier and key, for example Alt+R or Command+J.';
      }
    }
    if (draft.shortcut.trim().toLowerCase() === draft.captureShortcut.trim().toLowerCase()) errors.captureShortcut = 'Choose a different screenshot shortcut.';
    if (!draft.systemPrompt.trim()) errors.systemPrompt = 'Enter instructions for your assistant.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setSaveError('Check the highlighted settings below.'); return; }
    setSaving(true);
    try {
      await onSave({ ...draft, shortcut: draft.shortcut.trim(), captureShortcut: draft.captureShortcut.trim() });
      setSaved(true);
    } catch (error) { setSaveError(message(error)); }
    finally { setSaving(false); }
  }
  async function deleteHistory() {
    setDeleting(true); setHistoryError('');
    try { await onDeleteHistory(); setConfirmDelete(false); }
    catch (error) { setHistoryError(message(error)); }
    finally { setDeleting(false); }
  }

  return <aside className="settings-panel" aria-labelledby={`${id}-heading`}>
    <header className="panel-header">
      <div><h2 id={`${id}-heading`}>Make it yours</h2></div>
      <button type="button" className="ghost-button" onClick={onClose} aria-label="Close settings"><X size={20} aria-hidden="true" /></button>
    </header>
    <section className="settings-section" aria-labelledby={`${id}-connections`}>
      <h3 id={`${id}-connections`}>Connections</h3>
      <label className="field" htmlFor={`${id}-provider`}>Provider
        <select id={`${id}-provider`} value={provider} disabled={keyPending} onChange={event => {
          setProvider(event.target.value as Provider); setKey(''); setKeyError(''); setKeyNotice('');
        }}>{Object.entries(providerNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </label>
      <span className="key-status">{state.keys[provider] ? 'Key configured' : 'No key saved'}</span>
      <form onSubmit={event => { event.preventDefault(); void saveKey(); }}>
        <label className="field" htmlFor={`${id}-key`}>API key
          <input id={`${id}-key`} type="password" autoComplete="off" spellCheck={false} value={key}
            onChange={event => { setKey(event.target.value); setKeyError(''); setKeyNotice(''); }}
            disabled={isPreview || keyPending} placeholder={state.keys[provider] ? 'Enter a replacement key' : 'Paste your provider key'}
            aria-describedby={`${id}-key-help`} />
        </label>
        <p className="field-help" id={`${id}-key-help`}>{isPreview ? 'Open the desktop app to save API keys.' : 'Saved keys are never displayed here. Requests go to your selected provider.'}</p>
        <div className="inline-actions">
          <button className="secondary-button" type="submit" disabled={isPreview || keyPending || !key.trim()}>{keyPending ? 'Updating…' : 'Save key'}</button>
          {state.keys[provider] && <button className="ghost-button" type="button" disabled={isPreview || keyPending} onClick={() => void saveKey(true)}>Remove key</button>}
        </div>
      </form>
      {keyError && <p className="form-error" ref={keyErrorRef} tabIndex={-1} role="alert">{keyError}</p>}
      {keyNotice && <p className="field-help" role="status">{keyNotice}</p>}
      {state.storageNotice && <p className="field-help" role="note">{state.storageNotice}</p>}
      <p className="field-help">Free mode uses OpenRouter's available free models. Provider quotas and capacity apply; a key is still required.</p>
    </section>
    <form onSubmit={event => void saveSettings(event)}>
      <section className="settings-section" aria-labelledby={`${id}-workspace`}>
        <h3 id={`${id}-workspace`}>Workspace <span className="key-status">{dirty ? 'Unsaved changes' : saved ? 'Saved' : 'Up to date'}</span></h3>
        {saveError && <p className="form-error" ref={saveErrorRef} tabIndex={-1} role="alert">{saveError}</p>}
        {(['shortcut', 'captureShortcut'] as const).map(name => <div key={name}>
          <label className="field" htmlFor={`${id}-${name}`}>{name === 'shortcut' ? 'Show / hide shortcut' : 'Screenshot shortcut'}
            <input id={`${id}-${name}`} value={draft[name]} maxLength={80} disabled={saving} autoComplete="off"
              onChange={event => update(name, event.target.value)} aria-invalid={Boolean(fieldErrors[name])}
              aria-describedby={`${id}-${name}-help`} />
          </label>
          <p id={`${id}-${name}-help`} className={fieldErrors[name] ? 'form-error' : 'field-help'}>{fieldErrors[name] || 'Use + between keys, e.g. Alt+R or Command+Shift+S.'}</p>
        </div>)}
        <label className="toggle-row"><span>Keep window on top</span><input type="checkbox" checked={draft.alwaysOnTop} disabled={saving} onChange={event => update('alwaysOnTop', event.target.checked)} /></label>
        <label className="toggle-row"><span>Exclude window from screen capture</span><input type="checkbox" checked={draft.captureProtection} disabled={saving || !state.captureProtectionSupported} aria-describedby={`${id}-capture-privacy-help`} onChange={event => update('captureProtection', event.target.checked)} /></label>
        <p className="field-help" id={`${id}-capture-privacy-help`}>{state.captureProtectionNotice}</p>
        <label className="toggle-row"><span>Save history on this device</span><input type="checkbox" checked={draft.saveHistory} disabled={saving} aria-describedby={`${id}-history-help`} onChange={event => update('saveHistory', event.target.checked)} /></label>
        <p className="field-help" id={`${id}-history-help`}>{draft.saveHistory ? 'Recent conversation text is saved on this device. Screenshots stay in memory.' : 'Saving with history off removes existing saved history. New conversations will not be stored.'}</p>
        <details open={Boolean(fieldErrors.systemPrompt) || undefined}><summary>Advanced instructions</summary>
          <label className="field" htmlFor={`${id}-prompt`}>System prompt
            <textarea id={`${id}-prompt`} rows={5} maxLength={12000} value={draft.systemPrompt} disabled={saving}
              onChange={event => update('systemPrompt', event.target.value)} aria-invalid={Boolean(fieldErrors.systemPrompt)} aria-describedby={fieldErrors.systemPrompt ? `${id}-prompt-error` : undefined} />
          </label>
          {fieldErrors.systemPrompt && <p className="form-error" id={`${id}-prompt-error`}>{fieldErrors.systemPrompt}</p>}
        </details>
        <button className="primary-button" type="submit" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save settings'}</button>
        {saved && !dirty && <span className="field-help" role="status">Settings saved.</span>}
      </section>
    </form>
    <section className="settings-section" aria-labelledby={`${id}-history`}>
      <h3 id={`${id}-history`}>Local history</h3>
      {confirmDelete ? <><p className="field-help">Delete all saved conversations on this device? This cannot be undone.</p>
        <div className="inline-actions"><button className="danger-button" type="button" disabled={deleting} onClick={() => void deleteHistory()}>{deleting ? 'Deleting…' : 'Yes, delete history'}</button>
          <button className="ghost-button" type="button" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button></div></>
        : <button className="danger-button" type="button" disabled={deleting} onClick={() => { setConfirmDelete(true); setHistoryError(''); }}>Delete saved history</button>}
      {historyError && <p className="form-error" role="alert">{historyError}</p>}
    </section>
  </aside>;
}
