# Pages

Each folder under `src/pages/` should represent one slide/page in the deck.

Recommended page layout:

```text
src/pages/<page-name>/
  <PageName>Page.ts
  helpers.ts
  shaders/
  assets/
```

The deck framework only expects a page to implement `DeckPage`:

- `meta`: title/subtitle shown in the bottom bar
- `mount(context)`: create DOM, canvas, or Three.js scene
- `update(timeSeconds, deltaSeconds)`: animate the page
- `resize(width, height)`: respond to slide size changes
- `unmount()`: clean up event listeners, renderers, and DOM

Register real pages in `src/pages/index.ts`.

The `examples/` pages are only architecture samples. They are not final content.
