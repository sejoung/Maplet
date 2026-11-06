/**
 * The layer map of ADR 0001, shared by .dependency-cruiser.cjs and tests/architecture.
 * Dependency direction: domain ← application / engine / adapters ← components ← app.
 */

/** Each layer may import only these layers inside `src`. */
const LAYERS = {
  domain: ['domain'],
  application: ['application', 'domain'],
  engine: ['engine', 'domain'],
  adapters: ['adapters', 'domain', 'i18n'],
  i18n: ['i18n'],
  components: ['components', 'application', 'domain', 'engine', 'i18n'],
  app: ['app', 'components', 'application', 'domain', 'engine', 'adapters', 'i18n'],
};

/** npm packages a layer may use; a layer missing here is pure TypeScript. */
const PACKAGES = {
  i18n: ['react'],
  components: ['react', 'react-dom', 'lucide-react'],
  app: ['react', 'react-dom', 'lucide-react'],
};

module.exports = { LAYERS, PACKAGES };
