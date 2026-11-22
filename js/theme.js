/**
 * Theme toggle — light/dark, persisted in localStorage.
 * Works on all modern browsers (Chrome, Firefox, Safari, Edge).
 */
(function () {
    const STORAGE_KEY = 'rav-theme';
    const root = document.documentElement;

    function getPreferredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage may be blocked */ }

        const btn = document.getElementById('themeToggle');
        if (btn) {
            const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
            btn.setAttribute('aria-label', label);
            btn.title = label;
            btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        }
    }

    // Apply theme as early as possible to avoid a flash of the wrong theme.
    // documentElement exists even while the body is still parsing.
    applyTheme(getPreferredTheme());

    function init() {
        const btn = document.getElementById('themeToggle');
        if (!btn) {
            // Button not in DOM yet (script ran before body parsed) — wait for DOMContentLoaded
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        btn.addEventListener('click', () => {
            const current = root.getAttribute('data-theme') || 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();