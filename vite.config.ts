import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // base defaults to '/' for local dev and CI. The Pages deploy workflow
    // (.github/workflows/pages.yml) overrides it with /<repo-name>/ because
    // project pages are served under that prefix. Real env vars (process.env)
    // win over values from .env files (loadEnv).
    const env = loadEnv(mode, process.cwd(), '');
    const base = process.env.VITE_BASE ?? env.VITE_BASE ?? '/';

    return { base };
});
