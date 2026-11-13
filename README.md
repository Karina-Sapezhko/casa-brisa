# Casa Brisa

[Live website](https://casa-brisa.netlify.app/)

A single-page hotel portfolio concept set on Milos. Built with HTML, CSS and vanilla JavaScript, with no runtime dependencies or build step.

## Run locally

Serve the `dist` directory over HTTP:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:4173>. Edit the files in `dist` and reload the browser.

## Development checks

Node.js 22 or later is required for the development tools.

```sh
npm ci
npm run check
npm run format:check
```

`npm run check` checks JavaScript syntax, local asset references, anchor targets, duplicate IDs, gallery data and image crop bounds. It also exercises reveal timing, viewport entry, replay, focus and reduced-motion handling in a simulated environment. `npm run format` formats the source with Prettier.

## Structure

```text
dist/
  index.html         Page markup, illustrated map and room data
  styles.css         Presentation, typography and fixed navigation
  app.js             Scroll-driven presentation and local animation clocks
  reveal.js          Visibility tracking and repeatable entrance animations
  flower-videos.js   Video loops and transparent flower compositing
  island-view.js     Panorama parallax and cloud playback
  site-ui.js         Chapter navigation and adaptive control colours
  apartments.*      Room galleries, photo viewer and booking preview
  contact.*         Contact section and map entrance
  assets/           Images, videos and the local typeface
scripts/
  check.mjs          Repository integrity checks
tests/
  reveal.test.cjs    Visibility and animation timing regression tests
licenses/           Typeface licence and media credits
```

## Interaction

- The opening chapters share a scroll-driven canvas. Text, photography and map elements reveal independently and replay after leaving the viewport.
- Each room has its own gallery. Visible galleries advance automatically; an arrow, swipe or photo-viewer interaction switches that gallery to manual control until reload.
- Photos open in a full-screen viewer with arrow keys, buttons and touch swipes. Escape closes either dialog and returns focus to its opener.
- Booking buttons show the selected room in a local preview dialog. There is no reservation service, payment processing or form submission.
- Reduced-motion preferences disable decorative playback, parallax and animated transitions.
- Navigation links use page anchors; the site can be served from a subdirectory.

## Before deployment

Publish the contents of `dist` to a static host. Netlify uses `netlify.toml` to run the integrity checks with Node.js 22, then publishes `dist`. The connected `main` branch deploys automatically after each push. The hotel identity, contact details and illustrated location are fictional. See [asset credits](licenses/ASSETS.md) for photography and typeface provenance; media is not covered by a software licence for the repository.

For a production booking site, replace the placeholder details and connect an actual reservation service.

## Browser review

After changes to motion or layout, check the opening chapters in both scroll directions, all four room galleries, modal keyboard navigation, the contact anchor, and mobile portrait and landscape layouts. Automated integrity checks complement this visual review.
