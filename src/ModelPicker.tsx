import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown, Image, Leaf, LoaderCircle, Search, X } from 'lucide-react';
import type { ModelInfo } from '../shared/types';

interface ModelPickerProps {
  models: ModelInfo[];
  value: string;
  loading?: boolean;
  disabled?: boolean;
  onSelect: (modelId: string) => void;
}

interface PopupPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
}

export default function ModelPicker({
  models,
  value,
  loading = false,
  disabled = false,
  onSelect,
}: ModelPickerProps) {
  const id = useId();
  const popupId = `${id}-popup`;
  const listId = `${id}-models`;
  const hintId = `${id}-hint`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLDivElement>());
  const openingDirection = useRef<'first' | 'last'>('first');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [imagesOnly, setImagesOnly] = useState(false);
  const [activeId, setActiveId] = useState(value);
  const [position, setPosition] = useState<PopupPosition>({
    left: 0,
    bottom: 0,
    width: 440,
    maxHeight: 440,
  });
  const current = models.find((model) => model.id === value);
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return models.filter((model) => {
      const haystack = `${model.name} ${model.id}`.toLocaleLowerCase();
      return (!imagesOnly || model.vision) && terms.every((term) => haystack.includes(term));
    });
  }, [models, query, imagesOnly]);
  const activeIndex = filtered.findIndex((model) => model.id === activeId);

  function positionPopup() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(440, window.innerWidth - margin * 2);
    const above = rect.top - margin - 8;
    const below = window.innerHeight - rect.bottom - margin - 8;
    const placeAbove = above >= Math.min(360, below);
    const available = placeAbove ? above : below;
    const next: PopupPosition = {
      left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)),
      top: placeAbove ? undefined : rect.bottom + 8,
      bottom: placeAbove ? window.innerHeight - rect.top + 8 : undefined,
      width,
      maxHeight: Math.min(480, Math.max(180, available)),
    };
    setPosition((previous) =>
      previous.left === next.left &&
      previous.top === next.top &&
      previous.bottom === next.bottom &&
      previous.width === next.width &&
      previous.maxHeight === next.maxHeight
        ? previous
        : next,
    );
  }

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const handleToggle = (event: ToggleEvent) => setOpen(event.newState === 'open');
    popup.addEventListener('toggle', handleToggle);
    return () => popup.removeEventListener('toggle', handleToggle);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (activeIndex === -1 && filtered.length) {
      setActiveId(
        openingDirection.current === 'last' ? filtered[filtered.length - 1].id : filtered[0].id,
      );
    }
  }, [open, filtered, activeIndex]);

  useEffect(() => {
    if (open && activeIndex !== -1) {
      optionRefs.current.get(activeId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeId, activeIndex]);

  useEffect(() => {
    if (!open) return;
    if (disabled || loading) {
      popupRef.current?.hidePopover();
      return;
    }
    const reposition = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      positionPopup();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, disabled, loading]);

  function close(restoreFocus: boolean) {
    popupRef.current?.hidePopover();
    if (restoreFocus) triggerRef.current?.focus();
  }

  function choose(modelId: string) {
    if (disabled || loading) return;
    close(true);
    if (modelId !== value) onSelect(modelId);
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (!filtered.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next =
        activeIndex === -1
          ? direction === 1
            ? 0
            : filtered.length - 1
          : (activeIndex + direction + filtered.length) % filtered.length;
      setActiveId(filtered[next].id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.nativeEvent.isComposing && activeIndex !== -1) choose(filtered[activeIndex].id);
    }
  }

  return (
    <div className="model-picker">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="model-picker-trigger"
        aria-label="AI model"
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={loading}
        disabled={disabled || loading}
        popoverTarget={popupId}
        title={current ? `${current.name}\n${current.id}` : value}
        onClick={() => {
          setQuery('');
          setImagesOnly(false);
          setActiveId(value);
          positionPopup();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openingDirection.current = event.key === 'ArrowUp' ? 'last' : 'first';
            if (!open) event.currentTarget.click();
            else searchRef.current?.focus();
          }
        }}
      >
        <span className="model-picker-current">
          <span className="model-picker-current-name">
            {loading ? 'Loading models…' : current?.name || value || 'Choose a model'}
          </span>
          {!loading && !current && value && <small>Unavailable in this catalog</small>}
        </span>
        {current?.vision && (
          <span className="model-picker-vision" title="Accepts image input">
            <Image size={13} aria-hidden="true" />
            <span>Images</span>
          </span>
        )}
        {loading ? (
          <LoaderCircle size={14} className="spin" aria-hidden="true" />
        ) : (
          <ChevronDown size={14} aria-hidden="true" />
        )}
      </button>
      <div
        ref={popupRef}
        id={popupId}
        className="model-picker-popup"
        popover="auto"
        style={{
          left: position.left,
          top: position.top,
          bottom: position.bottom,
          width: position.width,
          maxHeight: position.maxHeight,
        }}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            close(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          }
        }}
      >
        <div className="model-picker-heading">
          <strong>Choose model</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Close model picker"
            onClick={() => close(true)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="model-picker-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            role="combobox"
            aria-label="Search models"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            aria-activedescendant={activeIndex === -1 ? undefined : `${id}-option-${activeIndex}`}
            aria-describedby={hintId}
            placeholder="Search name or model ID…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              openingDirection.current = 'first';
              setQuery(event.target.value);
            }}
            onKeyDown={handleSearchKey}
          />
        </div>
        <div className="model-picker-filters">
          <label>
            <input
              type="checkbox"
              checked={imagesOnly}
              onChange={(event) => {
                openingDirection.current = 'first';
                setImagesOnly(event.target.checked);
              }}
            />
            Images only
          </label>
          <span role="status">
            {filtered.length} {filtered.length === 1 ? 'model' : 'models'}
          </span>
        </div>
        {!current && value && (
          <p className="model-picker-unavailable">
            Current model is unavailable here. Choose a model from this catalog.
          </p>
        )}
        <div
          id={listId}
          role="listbox"
          aria-label="Available AI models"
          className="model-picker-list"
        >
          {open &&
            filtered.map((model, index) => (
              <div
                key={model.id}
                id={`${id}-option-${index}`}
                ref={(element) => {
                  if (element) optionRefs.current.set(model.id, element);
                  else optionRefs.current.delete(model.id);
                }}
                role="option"
                aria-selected={model.id === value}
                className={`model-picker-option${model.id === activeId ? ' active' : ''}`}
                onPointerMove={() => setActiveId(model.id)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(model.id)}
              >
                <span className="model-picker-option-copy">
                  <span className="model-picker-option-name">{model.name}</span>
                  <span className="model-picker-option-id">{model.id}</span>
                  <span className="model-picker-capabilities">
                    {model.vision ? (
                      <span>
                        <Image size={12} aria-hidden="true" /> Images
                      </span>
                    ) : (
                      <span>Text only</span>
                    )}
                    {model.free && (
                      <span>
                        <Leaf size={12} aria-hidden="true" /> Free
                      </span>
                    )}
                  </span>
                </span>
                {model.id === value && (
                  <Check size={17} className="model-picker-check" aria-hidden="true" />
                )}
              </div>
            ))}
          {open && !filtered.length && (
            <div className="model-picker-empty">
              <strong>{models.length ? 'No models found.' : 'No models available.'}</strong>
              <p>
                {models.length
                  ? 'Try a shorter name or model ID, or turn off Images only.'
                  : 'Close this picker and retry loading the model catalog.'}
              </p>
              {(query || imagesOnly) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setQuery('');
                    setImagesOnly(false);
                    searchRef.current?.focus();
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
        <p id={hintId} className="model-picker-hint">
          ↑ ↓ to browse · Enter to choose · Esc to close
        </p>
      </div>
    </div>
  );
}
