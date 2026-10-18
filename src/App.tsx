import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  Download,
  Globe2,
  ImagePlus,
  Keyboard,
  Leaf,
  LoaderCircle,
  MessageSquare,
  Maximize2,
  Minimize2,
  Minus,
  PanelRightClose,
  Pin,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, isPreview } from './bridge';
import {
  DEFAULT_SETTINGS,
  type AppState,
  type Attachment,
  type BrowserSnapshot,
  type Conversation,
  type Message,
  type ModelInfo,
  type Provider,
  type Settings,
  type WindowMode,
} from '../shared/types';
import SettingsPanel from './SettingsPanel';

const uid = () => crypto.randomUUID();
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const providerNames: Record<Provider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  gemini: 'Gemini',
};
type Panel = 'settings' | 'browser' | null;

export default function App() {
  const [state, setState] = useState<AppState>();
  const [loadError, setLoadError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>(uid);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pageContext, setPageContext] = useState<BrowserSnapshot>();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelError, setModelError] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [showDown, setShowDown] = useState(false);
  const [modelRetry, setModelRetry] = useState(0);
  const [modeBusy, setModeBusy] = useState(false);
  const activeRequest = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const settings = state?.settings ?? DEFAULT_SETTINGS;
  const activeProvider = settings.mode === 'free' ? 'openrouter' : settings.provider;
  const hasKey = Boolean(state?.keys[activeProvider]);
  const selectedModel = models.find((model) => model.id === settings.model);
  const companion = state?.windowMode === 'companion';

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        settings.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : settings.theme;
    };
    applyTheme();
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  const load = useCallback(async () => {
    try {
      setLoadError('');
      const next = await api.getState();
      setState(next);
      setConversations(next.conversations);
      if (next.conversations[0]) {
        setActiveId(next.conversations[0].id);
        setMessages(next.conversations[0].messages);
      }
    } catch (error) {
      setLoadError(errorText(error));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () =>
      api.onWindowMode((windowMode) => {
        setState((current) => current && { ...current, windowMode });
        if (windowMode === 'companion') setPanel(null);
      }),
    [],
  );
  useEffect(() => {
    if (stickToBottom.current)
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
  }, [companion]);
  useEffect(
    () =>
      api.onCapture((attachment) => {
        setAttachments((items) => {
          if (items.length >= 3) {
            setNotice(
              'You can attach up to three screenshots. Remove one before capturing another.',
            );
            return items;
          }
          setNotice('Screenshot attached. Review it before sending.');
          return [...items, attachment];
        });
        composerRef.current?.focus();
      }),
    [],
  );
  useEffect(
    () =>
      api.onChat((event) => {
        if (event.id !== activeRequest.current) return;
        if (event.type === 'delta') {
          setMessages((items) =>
            items.map((message, index) =>
              index === items.length - 1
                ? { ...message, content: message.content + event.text }
                : message,
            ),
          );
        } else {
          activeRequest.current = null;
          setStreaming(false);
          if (event.type === 'error') {
            setNotice(event.error);
            setMessages((items) =>
              items.filter((message) => message.role !== 'assistant' || message.content.length > 0),
            );
          }
          composerRef.current?.focus();
        }
      }),
    [],
  );
  useEffect(() => {
    if (!state) return;
    let stale = false;
    setModelsBusy(true);
    setModelError('');
    api
      .getModels(settings.mode, activeProvider)
      .then((result) => {
        if (!stale) setModels(result);
      })
      .catch((error) => {
        if (!stale) {
          setModels([]);
          setModelError(errorText(error));
        }
      })
      .finally(() => {
        if (!stale) setModelsBusy(false);
      });
    return () => {
      stale = true;
    };
  }, [
    settings.mode,
    activeProvider,
    state?.keys.openrouter,
    state?.keys.openai,
    state?.keys.gemini,
    modelRetry,
    Boolean(state),
  ]);
  useEffect(() => {
    if (!messages.length || streaming) return;
    const title =
      messages.find((message) => message.role === 'user')?.content.slice(0, 54) ||
      'Screenshot conversation';
    const conversation: Conversation = { id: activeId, title, updatedAt: Date.now(), messages };
    setConversations((items) =>
      [conversation, ...items.filter((item) => item.id !== activeId)].slice(0, 40),
    );
  }, [messages, streaming, activeId]);
  useEffect(() => {
    if (!state || !settings.saveHistory) return;
    const timer = window.setTimeout(() => {
      void api.saveConversations(conversations).catch((error) => setNotice(errorText(error)));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [conversations, settings.saveHistory, Boolean(state)]);
  useEffect(() => {
    if (stickToBottom.current)
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
  }, [messages]);

  async function saveSettings(next: Settings) {
    const saved = await api.saveSettings(next);
    setState((current) => current && { ...current, settings: saved });
  }
  async function switchWindowMode(mode: WindowMode, nextPanel: Panel = null) {
    if (modeBusy) return;
    setModeBusy(true);
    try {
      await api.setWindowMode(mode);
      setState((current) => current && { ...current, windowMode: mode });
      setPanel(mode === 'companion' ? null : nextPanel);
      if (!nextPanel) composerRef.current?.focus();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setModeBusy(false);
    }
  }
  function openPanel(nextPanel: Exclude<Panel, null>) {
    if (companion) void switchWindowMode('workspace', nextPanel);
    else setPanel(panel === nextPanel ? null : nextPanel);
  }
  async function saveKey(provider: Provider, key: string) {
    await api.setKey(provider, key);
    const next = await api.getState();
    setState(
      (current) => current && { ...current, keys: next.keys, storageNotice: next.storageNotice },
    );
    setModelRetry((count) => count + 1);
  }
  async function changeMode(mode: 'free' | 'byok') {
    if (streaming || mode === settings.mode) return;
    const provider = settings.provider;
    const model =
      mode === 'free'
        ? 'openrouter/free'
        : provider === 'openai'
          ? 'gpt-4.1-mini'
          : provider === 'gemini'
            ? 'gemini-2.5-flash'
            : 'openrouter/free';
    try {
      await saveSettings({ ...settings, mode, model });
    } catch (error) {
      setNotice(errorText(error));
    }
  }
  async function changeProvider(provider: Provider) {
    const model =
      provider === 'openai'
        ? 'gpt-4.1-mini'
        : provider === 'gemini'
          ? 'gemini-2.5-flash'
          : 'openrouter/free';
    try {
      await saveSettings({ ...settings, provider, model });
    } catch (error) {
      setNotice(errorText(error));
    }
  }
  async function stop() {
    const request = activeRequest.current;
    activeRequest.current = null;
    setStreaming(false);
    setMessages((items) =>
      items.at(-1)?.role === 'assistant' && !items.at(-1)?.content ? items.slice(0, -1) : items,
    );
    if (request) await api.cancelChat(request).catch((error) => setNotice(errorText(error)));
  }
  async function newConversation() {
    await stop();
    setActiveId(uid());
    setMessages([]);
    setDraft('');
    setAttachments([]);
    setPageContext(undefined);
    setNotice('');
    stickToBottom.current = true;
    composerRef.current?.focus();
  }
  async function openConversation(conversation: Conversation) {
    await stop();
    setActiveId(conversation.id);
    setMessages(conversation.messages);
    setAttachments([]);
    setDraft('');
    setNotice('');
    setPageContext(undefined);
    stickToBottom.current = true;
  }
  async function capture() {
    setCaptureBusy(true);
    try {
      const attachment = await api.captureScreen();
      setAttachments((items) => {
        if (items.length >= 3) {
          setNotice('You can attach up to three screenshots. Remove one before capturing another.');
          return items;
        }
        setNotice('Screenshot attached. Review it before sending.');
        return [...items, attachment];
      });
    } catch (error) {
      if (!errorText(error).includes('Screenshot cancelled.')) setNotice(errorText(error));
    } finally {
      setCaptureBusy(false);
    }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (streaming || (!draft.trim() && !attachments.length)) return;
    if (messages.length >= 99) {
      setNotice(
        'This conversation has reached its context limit. Export it or start a new conversation to continue.',
      );
      return;
    }
    if (
      messages.reduce((length, item) => length + item.content.length, 0) + draft.length >
      235000
    ) {
      setNotice(
        'This conversation is too large for another message. Export it or start a new conversation to continue.',
      );
      return;
    }
    if (
      messages.reduce((count, item) => count + (item.attachments?.length ?? 0), 0) +
        attachments.length >
      8
    ) {
      setNotice(
        'A conversation can contain up to eight screenshots. Start a new conversation to attach more.',
      );
      return;
    }
    if (
      [...messages.flatMap((item) => item.attachments ?? []), ...attachments].reduce(
        (bytes, item) => bytes + item.dataUrl.length,
        0,
      ) > 20000000
    ) {
      setNotice(
        'The screenshots in this conversation are too large. Remove an attachment or start a new conversation.',
      );
      return;
    }
    if (!hasKey && !isPreview) {
      setNotice(`Add your ${providerNames[activeProvider]} API key in Settings to start.`);
      openPanel('settings');
      return;
    }
    const userMessage: Message = {
      id: uid(),
      role: 'user',
      content: draft.trim() || 'Help me understand this screenshot.',
      ...(attachments.length ? { attachments } : {}),
    };
    const requestMessages = [...messages, userMessage];
    const requestId = uid();
    activeRequest.current = requestId;
    setMessages([...requestMessages, { id: uid(), role: 'assistant', content: '' }]);
    setDraft('');
    setAttachments([]);
    setPageContext(undefined);
    setNotice('');
    setStreaming(true);
    stickToBottom.current = true;
    try {
      await api.startChat({
        id: requestId,
        messages: requestMessages,
        ...(pageContext
          ? {
              browserContext: `Source URL: ${pageContext.url}\nPage title: ${pageContext.title}\nUntrusted page text:\n${pageContext.text}`,
            }
          : {}),
      });
    } catch (error) {
      if (activeRequest.current === requestId) {
        activeRequest.current = null;
        setStreaming(false);
        setNotice(errorText(error));
        setMessages((items) =>
          items.filter(
            (item) => item.id !== requestId && (item.role !== 'assistant' || item.content),
          ),
        );
      }
    }
  }
  const copy = useCallback(async (message: Message) => {
    try {
      await api.copyText(message.content);
      setCopied(message.id);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setNotice('Clipboard access failed. Select the answer text and copy it manually.');
    }
  }, []);
  function handleScroll() {
    const element = scrollRef.current;
    if (element) {
      stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      setShowDown(!stickToBottom.current);
    }
  }
  async function clearHistory() {
    const request = activeRequest.current;
    activeRequest.current = null;
    setMessages([]);
    setStreaming(false);
    setConversations([]);
    setActiveId(uid());
    setDraft('');
    setAttachments([]);
    setPageContext(undefined);
    setNotice('');
    if (request) await api.cancelChat(request);
    await api.saveConversations([]);
  }
  if (loadError)
    return (
      <div className="loading-screen">
        <Sparkles size={30} />
        <h1>LucentCue couldn’t open</h1>
        <p role="alert">{loadError}</p>
        <button className="primary-button" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (!state)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={28} />
        <p>Opening your workspace…</p>
      </div>
    );

  return (
    <div className={`app-shell ${companion ? 'companion-mode' : 'workspace-mode'}`}>
      {!companion && (
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="brand">
            <div className="brand-mark">
              <Sparkles size={21} strokeWidth={1.6} />
            </div>
            <span>
              LucentCue<span className="brand-dot">.</span>
            </span>
          </div>
          <button
            className="new-chat"
            aria-label="New conversation"
            onClick={() => void newConversation()}
          >
            <Plus size={17} />
            <span>New conversation</span>
          </button>
          <nav className="main-nav">
            <button
              aria-label="Workspace"
              className={!panel ? 'nav-item active' : 'nav-item'}
              onClick={() => setPanel(null)}
            >
              <MessageSquare size={17} />
              <span>Workspace</span>
            </button>
            <button
              aria-label="Browser assist"
              className={panel === 'browser' ? 'nav-item active' : 'nav-item'}
              onClick={() => setPanel(panel === 'browser' ? null : 'browser')}
            >
              <Globe2 size={17} />
              <span>Browser assist</span>
              <ArrowUpRight size={14} />
            </button>
          </nav>
          <div className="history-heading">
            <span>Conversations</span>
            <button
              className="icon-button"
              aria-label="Search conversations"
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((value) => !value)}
            >
              <Search size={15} />
            </button>
          </div>
          {searchOpen && (
            <label className="history-search">
              <span className="sr-only">Search conversations</span>
              <input
                autoFocus
                placeholder="Find a conversation…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          <div className="history-list">
            {conversations
              .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
              .map((item) => (
                <button
                  className={`history-item ${activeId === item.id ? 'selected' : ''}`}
                  key={item.id}
                  onClick={() => void openConversation(item)}
                >
                  <MessageSquare size={14} />
                  <span>{item.title}</span>
                </button>
              ))}
            {!conversations.length && (
              <p className="history-empty">
                Your next good idea
                <br />
                starts here.
              </p>
            )}
            {!!search &&
              !conversations.some((item) =>
                item.title.toLowerCase().includes(search.toLowerCase()),
              ) && <p className="history-empty">No matching conversations.</p>}
          </div>
          <div className="sidebar-bottom">
            <div className="shortcut-note">
              <Keyboard size={17} />
              <div>
                <span>A little help, a shortcut away</span>
                <kbd>{settings.shortcut}</kbd>
                <small>Show or hide your workspace</small>
              </div>
            </div>
            <button
              aria-label="Settings"
              className={`nav-item ${panel === 'settings' ? 'active' : ''}`}
              onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
            >
              <Settings2 size={17} />
              <span>Settings</span>
              <span className="version">v{state.version}</span>
            </button>
            <div className="sidebar-footer">
              <ShieldCheck size={13} />
              <span>
                {settings.saveHistory
                  ? 'History saved on this device'
                  : 'History stays in this session'}
              </span>
            </div>
          </div>
        </aside>
      )}

      <div className="workspace-shell">
        <header className="titlebar">
          {companion ? (
            <div className="companion-brand">
              <Sparkles size={18} aria-hidden="true" />
              <strong>LucentCue</strong>
            </div>
          ) : (
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{messages.length ? 'Conversation' : 'New conversation'}</strong>
            </div>
          )}
          <div className="window-actions">
            {companion ? (
              <>
                <button
                  className="icon-button"
                  aria-label="New conversation"
                  title="New conversation"
                  onClick={() => void newConversation()}
                >
                  <Plus size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Open workspace settings"
                  title="Open workspace settings"
                  disabled={modeBusy}
                  onClick={() => openPanel('settings')}
                >
                  <Settings2 size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Open full workspace"
                  title="Open full workspace"
                  disabled={modeBusy}
                  onClick={() => void switchWindowMode('workspace')}
                >
                  <Maximize2 size={16} />
                </button>
              </>
            ) : (
              <>
                {isPreview && <span className="preview-label">Interface preview</span>}
                <button
                  className="text-button companion-return"
                  aria-label="Companion mode"
                  title="Return to the small companion"
                  disabled={modeBusy}
                  onClick={() => void switchWindowMode('companion')}
                >
                  <Minimize2 size={15} />
                  <span>Companion</span>
                </button>
                <button
                  className={`icon-button ${settings.alwaysOnTop ? 'pressed' : ''}`}
                  aria-label="Keep window on top"
                  aria-pressed={settings.alwaysOnTop}
                  onClick={() =>
                    void saveSettings({ ...settings, alwaysOnTop: !settings.alwaysOnTop }).catch(
                      (error) => setNotice(errorText(error)),
                    )
                  }
                >
                  <Pin size={15} />
                </button>
                <span className="window-divider" />
                <button
                  className="icon-button"
                  aria-label="Minimize window"
                  disabled={isPreview}
                  onClick={() => void api.minimize()}
                >
                  <Minus size={17} />
                </button>
              </>
            )}
            <button
              className="icon-button close-window"
              aria-label="Hide window"
              disabled={isPreview}
              onClick={() => void api.hide()}
            >
              <X size={17} />
            </button>
          </div>
        </header>
        <div className={`workspace-body ${!companion && panel ? 'with-panel' : ''}`}>
          <main className="chat-workspace">
            {!companion && (
              <div className="chat-toolbar">
                <span className="workspace-label">
                  <span className="status-dot" /> Your workspace
                </span>
                <div className="toolbar-actions">
                  {messages.length > 0 && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void api
                          .exportConversation({
                            id: activeId,
                            title: messages[0].content.slice(0, 54),
                            updatedAt: Date.now(),
                            messages,
                          })
                          .then((saved) => {
                            if (saved) setNotice('Conversation exported.');
                          })
                          .catch((error) => setNotice(errorText(error)))
                      }
                    >
                      <Download size={14} />
                      Export
                    </button>
                  )}
                  <span className="local-label">
                    <ShieldCheck size={13} />
                    Local-first
                  </span>
                </div>
              </div>
            )}

            <div
              className={`conversation-scroll ${!messages.length ? 'is-empty' : ''}`}
              ref={scrollRef}
              onScroll={handleScroll}
            >
              {!messages.length && companion ? (
                <div className="companion-welcome">
                  <h1>A little help, right here.</h1>
                  <p>Ask a question or attach a screenshot.</p>
                </div>
              ) : !messages.length ? (
                <div className="welcome">
                  <div className="welcome-emblem">
                    <Sparkles size={32} strokeWidth={1.2} />
                  </div>
                  <h1>
                    A little clarity.
                    <br />
                    <span>Right when you need it.</span>
                  </h1>
                  <p>
                    Ask a question, share your screen, or bring a browser
                    <br className="wide-break" /> tab into the conversation. Make room for your next
                    idea.
                  </p>
                  <div className="suggestions" aria-label="Start a conversation">
                    <button
                      onClick={() => {
                        setDraft('Explain what’s on my screen and suggest a useful next step.');
                        void capture();
                      }}
                    >
                      <ImagePlus size={17} />
                      <span>Explain my screen</span>
                      <ArrowUpRight size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setDraft(
                          'Help me debug this code. I’ll paste the code and error below:\n\n',
                        );
                        composerRef.current?.focus();
                      }}
                    >
                      <Code2 size={17} />
                      <span>Untangle some code</span>
                      <ArrowUpRight size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setDraft(
                          'Help me research this question. Separate confirmed facts from uncertainty:\n\n',
                        );
                        composerRef.current?.focus();
                      }}
                    >
                      <Search size={17} />
                      <span>Explore a question</span>
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="message-list"
                  aria-live="polite"
                  aria-relevant="additions text"
                  aria-busy={streaming}
                >
                  {messages.map((message, index) => (
                    <MessageView
                      key={message.id}
                      message={message}
                      generating={streaming && index === messages.length - 1}
                      copied={copied === message.id}
                      onCopy={copy}
                      onNotice={setNotice}
                    />
                  ))}
                </div>
              )}
            </div>
            {showDown && (
              <button
                className="scroll-down icon-button"
                aria-label="Scroll to latest answer"
                onClick={() => {
                  stickToBottom.current = true;
                  scrollRef.current?.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: 'smooth',
                  });
                  setShowDown(false);
                }}
              >
                <ArrowDown size={17} />
              </button>
            )}

            <div className="composer-area">
              {!hasKey && (
                <div className="connect-prompt">
                  <div>
                    <span className="connect-dot" />
                    <span>
                      {companion
                        ? `Add your ${providerNames[activeProvider]} key to ask.`
                        : isPreview
                          ? 'You’re viewing the interface preview.'
                          : `Connect ${providerNames[activeProvider]} to get started.`}
                    </span>
                  </div>
                  <button onClick={() => openPanel('settings')} disabled={modeBusy}>
                    {isPreview ? 'View settings' : 'Add API key'}
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              )}
              {notice && (
                <div className="notice" role="status">
                  <CircleHelp size={15} />
                  <span>{notice}</span>
                  <button
                    className="icon-button"
                    aria-label="Dismiss notification"
                    onClick={() => setNotice('')}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {pageContext && (
                <div className="context-chip">
                  <Globe2 size={14} />
                  <span>Page attached: {pageContext.title || pageContext.url}</span>
                  <button
                    className="icon-button"
                    aria-label="Remove page context"
                    onClick={() => setPageContext(undefined)}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <form className="composer" onSubmit={(event) => void send(event)}>
                {attachments.length > 0 && (
                  <div className="attachment-list">
                    {attachments.map((attachment) => (
                      <div className="attachment" key={attachment.id}>
                        <img src={attachment.dataUrl} alt="Screenshot preview" />
                        <span>{attachment.name}</span>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove ${attachment.name}`}
                          onClick={() =>
                            setAttachments((items) =>
                              items.filter((item) => item.id !== attachment.id),
                            )
                          }
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="sr-only" htmlFor="message-input">
                  Message LucentCue
                </label>
                <textarea
                  id="message-input"
                  ref={composerRef}
                  placeholder="What’s on your mind?"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                  maxLength={32000}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-controls">
                  <div className="composer-tools">
                    <button
                      type="button"
                      className="icon-button"
                      title={`Capture screenshot · ${settings.captureShortcut}`}
                      aria-label="Capture screenshot"
                      disabled={captureBusy || attachments.length >= 3}
                      onClick={() => void capture()}
                    >
                      {captureBusy ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <ImagePlus size={18} />
                      )}
                    </button>
                    <button
                      type="button"
                      className={`icon-button ${panel === 'browser' ? 'pressed' : ''}`}
                      title="Attach a browser page"
                      aria-label="Open browser assistance"
                      disabled={modeBusy}
                      onClick={() => openPanel('browser')}
                    >
                      <Globe2 size={18} />
                    </button>
                    <span className="composer-divider" />
                    <span className="mode-indicator">
                      {settings.mode === 'free' ? <Leaf size={13} /> : <Sparkles size={13} />}
                      {settings.mode === 'free' ? 'Free models only' : 'Your key, your model'}
                    </span>
                  </div>
                  {streaming ? (
                    <button
                      className="send-button stopping"
                      type="button"
                      aria-label="Stop generating"
                      onClick={() => void stop()}
                    >
                      <Square size={15} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      type="submit"
                      aria-label="Send message"
                      disabled={!draft.trim() && !attachments.length}
                    >
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
              </form>
              {!companion && (
                <div className="model-bar">
                  <div className="mode-switch" aria-label="Access mode">
                    <button
                      className={settings.mode === 'free' ? 'selected' : ''}
                      disabled={streaming}
                      onClick={() => void changeMode('free')}
                    >
                      <Leaf size={12} />
                      Free
                    </button>
                    <button
                      className={settings.mode === 'byok' ? 'selected' : ''}
                      disabled={streaming}
                      onClick={() => void changeMode('byok')}
                    >
                      Bring your key
                    </button>
                  </div>
                  <div className="model-controls">
                    {settings.mode === 'byok' && (
                      <label>
                        <span className="sr-only">AI provider</span>
                        <select
                          aria-label="AI provider"
                          disabled={streaming}
                          value={settings.provider}
                          onChange={(event) => void changeProvider(event.target.value as Provider)}
                        >
                          {Object.entries(providerNames).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="model-select">
                      <span className="sr-only">AI model</span>
                      <select
                        aria-label="AI model"
                        disabled={streaming || modelsBusy}
                        value={settings.model}
                        onChange={(event) =>
                          void saveSettings({ ...settings, model: event.target.value }).catch(
                            (error) => setNotice(errorText(error)),
                          )
                        }
                      >
                        {!models.some((model) => model.id === settings.model) && (
                          <option value={settings.model}>
                            {modelsBusy ? 'Loading models…' : settings.model}
                          </option>
                        )}
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                            {model.vision ? ' · vision' : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} />
                    </label>
                  </div>
                </div>
              )}
              {companion && (
                <div className="companion-footer">
                  <button
                    className="text-button"
                    aria-label="Open model settings"
                    title={selectedModel?.name || settings.model}
                    disabled={modeBusy}
                    onClick={() => void switchWindowMode('workspace')}
                  >
                    {settings.mode === 'free' ? <Leaf size={12} /> : <Sparkles size={12} />}
                    <span>{selectedModel?.name || settings.model}</span>
                  </button>
                  <span>
                    <kbd>{settings.shortcut}</kbd> show / hide
                  </span>
                </div>
              )}
              {modelError && (
                <p className="catalog-error" role="status">
                  {modelError}
                  <button onClick={() => setModelRetry((count) => count + 1)}>Retry</button>
                </p>
              )}
              {!companion && (
                <p className="composer-footnote">
                  {attachments.length && selectedModel && !selectedModel.vision
                    ? 'Choose a vision model to send screenshots.'
                    : settings.mode === 'free'
                      ? 'Free models have provider rate limits. No automatic paid fallback.'
                      : 'Provider charges may apply to your key.'}
                  <span>
                    <kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line
                  </span>
                </p>
              )}
            </div>
          </main>
          {!companion && panel === 'settings' && (
            <SettingsPanel
              state={state}
              isPreview={isPreview}
              onClose={() => setPanel(null)}
              onSave={saveSettings}
              onKey={saveKey}
              onDeleteHistory={clearHistory}
            />
          )}
          {!companion && panel === 'browser' && (
            <BrowserPanel
              onClose={() => setPanel(null)}
              onAttach={(snapshot) => {
                setPageContext(snapshot);
                setNotice('Page text attached. It will be sent with your next message.');
              }}
              latestAnswer={
                [...messages].reverse().find((message) => message.role === 'assistant')?.content ??
                ''
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Completed rows keep their parsed Markdown while the draft or current answer changes. */
const MessageView = memo(function MessageView({
  message,
  generating,
  copied,
  onCopy,
  onNotice,
}: {
  message: Message;
  generating: boolean;
  copied: boolean;
  onCopy: (message: Message) => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  return (
    <article className={`message ${message.role}`}>
      <div className="message-author">
        {message.role === 'assistant' ? (
          <>
            <Sparkles size={16} />
            <span>LucentCue</span>
          </>
        ) : (
          <>
            <div className="user-avatar">Y</div>
            <span>You</span>
          </>
        )}
      </div>
      {message.attachments?.map((attachment) => (
        <img
          className="message-image"
          key={attachment.id}
          src={attachment.dataUrl}
          alt={attachment.name}
        />
      ))}
      <div className="markdown">
        {message.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: () => <span className="remote-image-note">[Remote image omitted]</span>,
              a: ({ href, children }) => (
                <a
                  href={href}
                  title={href}
                  onClick={(event) => {
                    event.preventDefault();
                    if (href)
                      void api.openExternal(href).catch((error) => onNotice(errorText(error)));
                  }}
                >
                  {children}
                  <ArrowUpRight size={12} />
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          <span className="thinking">
            <span />
            <span />
            <span />
            <span className="sr-only">Waiting for the model…</span>
          </span>
        )}
      </div>
      {message.role === 'assistant' && message.content && !generating && (
        <div className="message-actions">
          <button className="text-button" onClick={() => void onCopy(message)}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy answer'}
          </button>
        </div>
      )}
    </article>
  );
});

function BrowserPanel({
  onClose,
  onAttach,
  latestAnswer,
}: {
  onClose: () => void;
  onAttach: (snapshot: BrowserSnapshot) => void;
  latestAnswer: string;
}) {
  const [url, setUrl] = useState('https://example.com');
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>();
  const [field, setField] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  async function run(action: string, work: () => Promise<void>) {
    setBusy(action);
    setFeedback('');
    try {
      await work();
    } catch (error) {
      setFeedback(errorText(error));
    } finally {
      setBusy('');
    }
  }
  return (
    <aside className="browser-panel" aria-label="Browser assistance">
      <div className="panel-header">
        <div>
          <Globe2 size={19} />
          <h2>Browser assist</h2>
        </div>
        <button className="icon-button" aria-label="Close browser panel" onClick={onClose}>
          <PanelRightClose size={18} />
        </button>
      </div>
      <p className="panel-intro">
        Bring a page into focus. Read it, ask about it, then fill a field when you’re ready.
      </p>
      <form
        className="browser-section"
        onSubmit={(event) => {
          event.preventDefault();
          void run('open', async () => {
            await api.browserOpen(url);
            setSnapshot(undefined);
            setFeedback('Browser opened. Navigate to any page, then read the current tab.');
          });
        }}
      >
        <label className="field" htmlFor="browser-url">
          Page address
          <input
            id="browser-url"
            value={url}
            placeholder="https://example.com"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={!!busy || isPreview} type="submit">
          {busy === 'open' ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <ArrowUpRight size={15} />
          )}
          Open browser
        </button>
        <p className="field-help">
          Uses a separate, visible browser profile. First time? Set up the assistant browser once.
        </p>
        <button
          type="button"
          className="text-button"
          disabled={!!busy || isPreview}
          onClick={() =>
            void run('install', async () => {
              await api.browserInstall();
              setFeedback(
                'Assistant browser is ready. Enter a page address and choose Open browser.',
              );
            })
          }
        >
          {busy === 'install' ? (
            <>
              <LoaderCircle size={14} className="spin" />
              Downloading browser. This may take a few minutes…
            </>
          ) : (
            'Set up assistant browser'
          )}
        </button>
      </form>
      <section className="browser-section">
        <h3>Read the current tab</h3>
        <p className="field-help">
          Page text is a reference. Review it here before you attach it to a question.
        </p>
        <button
          className="secondary-button"
          disabled={!!busy || isPreview}
          onClick={() =>
            void run('read', async () => {
              const result = await api.browserRead();
              setSnapshot(result);
              setField(result.fields[0]?.id ?? '');
              setFeedback('Page read. Nothing has been sent to your AI provider.');
            })
          }
        >
          {busy === 'read' ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}Read
          page
        </button>
        {snapshot && (
          <div className="page-preview">
            <strong>{snapshot.title || 'Untitled page'}</strong>
            <span className="page-url">{snapshot.url}</span>
            <details>
              <summary>
                Preview page text · {snapshot.text.length.toLocaleString()} characters
              </summary>
              <p>{snapshot.text || 'This page contains no readable text.'}</p>
            </details>
            <button className="secondary-button" onClick={() => onAttach(snapshot)}>
              <Plus size={14} />
              Attach to question
            </button>
          </div>
        )}
      </section>
      <section className="browser-section">
        <h3>Fill a field</h3>
        <p className="field-help">
          Choose a field from the page you read. You review and submit in the browser.
        </p>
        <label className="field">
          Page field
          <select
            value={field}
            onChange={(event) => setField(event.target.value)}
            disabled={!snapshot?.fields.length || !!busy}
          >
            <option value="">{snapshot ? 'Choose a field' : 'Read a page first'}</option>
            {snapshot?.fields.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label} ({item.type})
              </option>
            ))}
          </select>
        </label>
        {snapshot && !snapshot.fields.length && (
          <p className="field-help">
            No supported visible text fields found. Login and payment fields are excluded.
          </p>
        )}
        <label className="field">
          Text to fill
          <textarea
            rows={4}
            value={text}
            maxLength={20000}
            placeholder="Write or paste text to review…"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {latestAnswer && (
          <button className="text-button" onClick={() => setText(latestAnswer)}>
            Use latest answer
          </button>
        )}
        <button
          className="primary-button"
          disabled={!field || !text.trim() || !!busy || isPreview}
          onClick={() =>
            void run('fill', async () => {
              await api.browserFill(field, text);
              setFeedback('Field filled. Review it in the browser; it has not been submitted.');
              setField('');
            })
          }
        >
          {busy === 'fill' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Fill
          selected field
        </button>
      </section>
      {feedback && (
        <p className="panel-feedback" role="status">
          {feedback}
        </p>
      )}
      {isPreview && (
        <p className="panel-feedback">Browser actions are available in the desktop app.</p>
      )}
      <button
        className="text-button browser-close"
        disabled={!!busy || isPreview}
        onClick={() =>
          void run('close', async () => {
            await api.browserClose();
            setSnapshot(undefined);
            setField('');
            setFeedback('Assistant browser closed.');
          })
        }
      >
        Close assistant browser
      </button>
    </aside>
  );
}
