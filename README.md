<p align="center">
  <img src="public/icon.svg" alt="Maplet" width="72" height="72" />
</p>

<h1 align="center">Maplet</h1>

<p align="center">A local-first mind map editor for MindMup files.</p>

<p align="center">
  <strong>English</strong> · <a href="README.ko.md" lang="ko">한국어</a>
</p>

[![Quality](https://github.com/sejoung/Maplet/actions/workflows/ci.yml/badge.svg)](https://github.com/sejoung/Maplet/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-236b58.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)](.nvmrc)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](package.json)

Open a `.mup` file, arrange your ideas, and download your changes. Maplet keeps editing in your browser, with a simple toolbar and a readable canvas. Local file editing requires no account or backend. Google Drive is optional.

![Maplet editor with a sample mind map and freely positioned nodes](docs/screenshots/free-positioning.png)

[Quick start](#quick-start) · [Features](#features) · [Development](#development) · [Contributing](#contributing) · [Mobile preview](docs/screenshots/mobile.png)

## Features

- **MindMup files:** open `.mup` files by selecting or dropping them, export edits, and download an untouched original backup.
- **Direct editing:** create, rename, delete, and reparent nodes; add notes, links, and optional background colors from the toolbar.
- **Move whole branches:** drag a parent and all its descendants together, preserving their relative positions. Connections follow as you move. Other branches stay in place.
- **Navigate your map:** search, collapse branches, zoom, pan, fit to screen, or restore automatic layout.
- **Undo and recovery:** undo or redo a whole drag in one step; recover browser drafts from IndexedDB and keep manual positions when reopening files.
- **Optional Google Drive:** connect through Google Picker, open files, save changes or a new copy, and resolve version conflicts explicitly.

The current app interface is in Korean. Both README versions describe the same features and commands.

## Quick start

Use **Node.js 24** and npm.

```sh
git clone https://github.com/sejoung/Maplet.git
cd Maplet
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Start from the central topic or open a file through **파일 → 열기** (File → Open). Double-click a node to edit it, drag it to move its branch, and use **.mup 저장** to download the map.

Local editing works without environment variables. To enable Drive, copy [`.env.example`](.env.example) to `.env.local`, fill in the public Google configuration, and follow the [Drive setup guide](docs/google-drive.md) (Korean). Never include a client secret in a browser build.

## Keyboard shortcuts

| Shortcut                     | Action                            |
| ---------------------------- | --------------------------------- |
| `Tab`                        | Add a child                       |
| `Enter`                      | Add a sibling                     |
| `F2` / double-click          | Edit a title                      |
| Arrow keys                   | Navigate the hierarchy            |
| `Delete` / `Backspace`       | Delete a node and its descendants |
| `Ctrl` / `⌘` + `Z`           | Undo                              |
| `Ctrl` / `⌘` + `Shift` + `Z` | Redo                              |
| `Ctrl` / `⌘` + `S`           | Download the map                  |
| `Space` + drag               | Pan the canvas                    |
| `Ctrl` + wheel / pinch       | Zoom                              |

While editing a title: `Enter` applies, `Shift` + `Enter` inserts a newline, `Escape` cancels, and `Tab` applies the title and starts a child. During a drag, `Escape` cancels the whole branch movement.

## File compatibility

Maplet reads MindMup v1, v2, and v3, including multiple roots in v3. It preserves unknown metadata and the original imported text. Manual positions are stored in the **Maplet-specific** `attr["maplet:position"]` extension; other editors may display a different layout.

Images, HTML attachments, and cross-links are preserved as data but do not have dedicated rendering. Compatibility tests currently use synthetic fixtures; full compatibility with every MindMup file is not guaranteed. See the [compatibility matrix](docs/compatibility.md) and [verification record](docs/verification.md) (Korean).

Import limits: **10 MiB**, **5,000 nodes**, **100 levels**, and **10,000 characters per title**. Download `.mup` files for a portable copy; browser drafts are stored separately on the current device.

## Development

Built with React, TypeScript, Vite, and an SVG-based layout renderer. Tests use Vitest and Playwright.

```sh
# Formatting, lint, types, unit/integration/architecture tests, coverage, and build
npm run verify

# Browser regression tests
npx playwright install chromium firefox webkit
npm run test:e2e

# Watch tests while developing
npm run test:watch
```

The quality workflow runs verification and E2E tests across Chromium, Firefox, WebKit, and mobile WebKit. It also checks accessibility. Layer boundaries and circular dependencies are enforced by architecture tests. Code files are limited to **400 lines**, including comments and blank lines; source CSS has the same limit.

Each npm test command saves logs and reports in `test-results/<UTC timestamp>-<kind>-<unique suffix>/`. Relative symlinks point to the latest completed run, including failures:

| Path                                               | Contents                                                   |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `test-results/latest/summary.json`                 | Most recent run status, command, timestamps, and exit code |
| `test-results/latest-coverage/coverage/index.html` | Latest coverage report                                     |
| `test-results/latest-e2e/html/index.html`          | Latest browser report                                      |

Results are ignored by Git and uploaded as CI artifacts. Open the latest browser report with:

```sh
npx playwright show-report test-results/latest-e2e/html
```

### Project structure

```text
src/
  app/           Application assembly, document lifecycle, Drive coordination
  components/    Toolbar, canvas, node editing, dialogs
  domain/        Map model and editing commands
  application/   History and use cases
  adapters/      MindMup codec, file I/O, IndexedDB, Google Drive
  engine/        Layout and connection geometry
  styles/        Base, editor, canvas, dialog, and responsive styles
tests/
  unit/          Domain, layout, codec, and adapter tests
  integration/   Draft storage and development tooling tests
  architecture/  Dependency boundaries and cycle checks
  e2e/           Browser scenarios
  fixtures/      Synthetic .mup samples
docs/            Guides, screenshots, and architecture decisions
```

### Self-hosting

```sh
npm run build
npm run preview
```

Deploy `dist/` to a static host. Asset paths are relative, so repository subpaths are supported. The [Pages workflow](.github/workflows/pages.yml) provides manual GitHub Pages deployment; enable GitHub Actions as the Pages source before running it. Drive requires configuration for the deployed origin and a rebuild.

## Documentation

Detailed guides are currently in Korean.

| Document                                        | Topics                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| [Design guide](docs/design-guide.md)            | Readability, colors, interaction, and accessibility   |
| [Development guide](docs/contributing.md)       | TDD, quality checks, test artifacts, and deployment   |
| [Compatibility](docs/compatibility.md)          | Supported formats and preservation rules              |
| [Google Drive](docs/google-drive.md)            | Optional configuration and deployment checks          |
| [Verification](docs/verification.md)            | Implemented scope, evidence, and remaining validation |
| [Architecture decisions](docs/adr/)             | Layers, file formats, UI, dragging, and tooling       |
| [Original product brief](docs/product-brief.md) | Historical goals and acceptance criteria              |

## Contributing

Bug reports, fixes, accessibility improvements, and documentation translations are welcome. [Open an issue](https://github.com/sejoung/Maplet/issues) with steps to reproduce a problem. If a map is needed, use an anonymized sample.

For code changes, add a failing regression test first, keep tests in `tests/` and production code in `src/`, and run `npm run verify` plus the relevant E2E tests before opening a pull request. Record architectural changes in `docs/adr/`. See the [development guide](docs/contributing.md) for the full workflow.

When changing README content, update both [English](README.md) and [한국어](README.ko.md).

## License

[MIT](LICENSE) © 2026 sejoung kim.
