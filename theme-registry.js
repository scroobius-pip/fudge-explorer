(function (global) {
  'use strict';
  const STORAGE_KEY = 'fudge-explorer-theme';
  const registry = new Map();
  const mounted = new Set();
  let activeId = null;

  const safeStorage = {
    get() { try { return global.localStorage.getItem(STORAGE_KEY); } catch (_) { return null; } },
    set(value) { try { global.localStorage.setItem(STORAGE_KEY, value); } catch (_) { /* file:// or restricted storage */ } }
  };

  function normalize(id, spec) {
    if (!id || typeof id !== 'string') throw new TypeError('Theme id must be a non-empty string.');
    if (!spec || typeof spec !== 'object') throw new TypeError('Theme specification must be an object.');
    const base = spec.extends ? registry.get(spec.extends) : null;
    if (spec.extends && !base) throw new Error(`Unknown base theme: ${spec.extends}`);
    if (!base && !spec.tokens) throw new TypeError('Theme requires a tokens object or an extends property.');
    return {
      id,
      label: spec.label || id,
      colorScheme: spec.colorScheme || base?.colorScheme || 'light',
      tokens: { ...(base?.tokens || {}), ...(spec.tokens || {}) }
    };
  }

  function refreshPickers() {
    for (const select of [...mounted]) {
      if (!select.isConnected) { mounted.delete(select); continue; }
      const prior = select.value;
      select.innerHTML = [...registry.values()].map(theme =>
        `<option value="${theme.id}">${theme.label}</option>`
      ).join('');
      select.value = activeId || prior || [...registry.keys()][0] || '';
    }
  }

  function apply(id, options = {}) {
    const persist = options.persist !== false;
    const theme = registry.get(id) || registry.values().next().value;
    if (!theme) return null;
    const root = document.documentElement;
    for (const [token, value] of Object.entries(theme.tokens)) root.style.setProperty(`--${token}`, value);
    root.dataset.theme = theme.id;
    root.style.colorScheme = theme.colorScheme;
    activeId = theme.id;
    if (persist) safeStorage.set(theme.id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && theme.tokens['color-bg']) meta.setAttribute('content', theme.tokens['color-bg']);
    refreshPickers();
    document.dispatchEvent(new CustomEvent('fudge:themechange', { detail: { id: theme.id, theme } }));
    return theme;
  }

  function register(id, spec) {
    const theme = normalize(id, spec);
    registry.set(id, theme);
    refreshPickers();
    document.dispatchEvent(new CustomEvent('fudge:themeschange', { detail: { id } }));
    return api;
  }

  function unregister(id) {
    const removed = registry.delete(id);
    if (removed && activeId === id) apply(registry.keys().next().value, { persist: true });
    refreshPickers();
    return removed;
  }

  function mount(target) {
    const select = typeof target === 'string' ? document.querySelector(target) : target;
    if (!select || select.tagName !== 'SELECT') return null;
    if (!mounted.has(select)) {
      mounted.add(select);
      select.addEventListener('change', () => apply(select.value));
    }
    refreshPickers();
    return select;
  }

  const api = {
    register, unregister, apply, mount,
    list: () => [...registry.values()].map(theme => ({ ...theme, tokens: { ...theme.tokens } })),
    get: id => registry.get(id) || null,
    current: () => activeId,
  };
  global.FudgeThemeManager = api;

  const builtins = {
    paper: {
      label: "Paper", colorScheme: "light",
      tokens: {
        "color-bg": "#FFFFFF", "color-surface": "#FFFFFF", "color-surface-active": "#FCFCFC",
        "color-surface-hover": "#F4F5F6", "color-surface-soft": "#F6F7F8",
        "color-text": "#171717", "color-text-mut": "#5F656C", "color-text-faint": "#6C737B",
        "color-line": "#E3E6EA", "color-line-strong": "#C9CFD6",
        "color-input-border": "#7B838C", "color-focus-ring": "#2454C6",
        "color-shadow": "rgba(18, 25, 33, .16)", "color-code-bg": "#F6F7F8",
        "color-favicon-bg": "#F2F4F5", "color-scroll-thumb": "#B9C0C7",
        "entity-ink": "#171717", "entity-domain": "#171717", "entity-capture": "#2454C6",
        "entity-term": "#6842C2", "entity-facet": "#6842C2", "entity-family": "#C2410C",
        "entity-designer": "#8A5A00", "entity-structure": "#277844", "entity-color": "#0F6F78",
        "entity-neutral": "#4B5563", "entity-motion": "#B42318", "entity-video": "#B54708"
      }
    },
    night: {
      label: "Night", colorScheme: "dark",
      tokens: {
        "color-bg": "#111315", "color-surface": "#15181B", "color-surface-active": "#181C20",
        "color-surface-hover": "#20252A", "color-surface-soft": "#1C2024",
        "color-text": "#F2F4F6", "color-text-mut": "#BAC1C8", "color-text-faint": "#9AA4AE",
        "color-line": "#30363D", "color-line-strong": "#46505A",
        "color-input-border": "#7E8994", "color-focus-ring": "#8FB0FF",
        "color-shadow": "rgba(0, 0, 0, .48)", "color-code-bg": "#191D21",
        "color-favicon-bg": "#20252A", "color-scroll-thumb": "#3C434B",
        "entity-ink": "#F2F4F6", "entity-domain": "#F2F4F6", "entity-capture": "#8FB0FF",
        "entity-term": "#B197FC", "entity-facet": "#B197FC", "entity-family": "#FFB066",
        "entity-designer": "#FFD166", "entity-structure": "#6EE7A0", "entity-color": "#5EEAD4",
        "entity-neutral": "#9CA3AF", "entity-motion": "#F87171", "entity-video": "#FBBF24"
      }
    },
    warm: {
      label: "Warm", colorScheme: "light", extends: "paper",
      tokens: {
        "color-bg": "#FAF6F0", "color-surface": "#FDFBF7", "color-surface-active": "#F7F2EA",
        "color-surface-hover": "#F1EADF", "color-surface-soft": "#F4EEE5",
        "color-text": "#241F19", "color-text-mut": "#6B6157", "color-text-faint": "#756A5C",
        "color-line": "#E7DED2", "color-line-strong": "#D5C8B6",
        "color-focus-ring": "#7C4A03", "color-selection": "#F3E4C8",
        "color-shadow": "rgba(70, 55, 35, .14)", "color-code-bg": "#F2EBE0",
        "color-favicon-bg": "#F1EADF", "color-scroll-thumb": "#CFC2AF",
        "entity-ink": "#241F19", "entity-domain": "#241F19", "entity-capture": "#2454C6",
        "entity-term": "#6842C2", "entity-facet": "#6842C2", "entity-family": "#B45309",
        "entity-designer": "#7C4A03", "entity-structure": "#277844", "entity-color": "#0F6F78",
        "entity-neutral": "#5B5349", "entity-motion": "#B42318", "entity-video": "#9A3412"
      }
    }
  };
  for (const [id, spec] of Object.entries(builtins)) register(id, spec);
  const stored = safeStorage.get();
  apply(registry.has(stored) ? stored : 'paper', { persist: false });

  document.addEventListener('DOMContentLoaded', () => {
    mount('#theme-picker');
    apply(activeId || 'paper', { persist: false });
  });
  global.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && registry.has(event.newValue)) apply(event.newValue, { persist: false });
  });
})(window);
