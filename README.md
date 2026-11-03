# Slimnote website

The marketing site for Slimnote. Plain HTML, CSS and a little JavaScript: no build step.

## Open it

Open `index.html` in a browser, or run a small local server in this folder:

```
python3 -m http.server 8090
```

then visit http://localhost:8090.

## What's here

| Path | What |
| --- | --- |
| `index.html` | The page. Right now: the nav, the hero and Blocks in action. |
| `css/site.css` | All styles. Sizes follow Figma "Notes App" › Frame 100 (1440 wide). |
| `js/hero.js` | The hero: shows one note after another in the Mac window, each building itself in. |
| `assets/img/hero-landscape.webp` | The hero background (v6). The video (`assets/video/hero.mp4`) is kept for the earlier versions. |
| `assets/img/` | Logo, photos and stickers used by the notes in the window. |

## The hero

- The window is a full 1440 × 900 Mac screen, scaled down to fit (about 948 px wide on desktop).
- Five notes take turns: photo cover + process, scrapbook gallery, dynamic text, tasks + canvas, publishing.
- Each note is written in order on one timeline: the title types, then each block arrives; dynamic words, process steps and board columns appear one by one before the next block starts. A note stays until it's done, plus a short pause.
- Chloe places a sticker in the scrapbook. Jake drags a task from Doing to Done and the board rearranges (cards close the gap, counts update, the canvas eases down). Sam clicks Publish: Publishing…, Updated, then the popover and the toast.
- Cursors are the three designs from Figma (Frame 100 › Frame 106): `assets/img/cursor-cyan.svg` (Sam), `cursor-pink.svg` (Jake), `cursor-blue.svg` (Chloe).
- Motion uses three curves from `css/site.css`: `--ease-out` for things arriving, `--ease-in-out` for cursors and drags, `--ease-pop` for word chips.
- Cursors move like a hand: quick start, long soft landing, slightly curved paths. Notes glide in and out.
- The dots in the corner jump to a note.
- It pauses when the hero is off screen or the tab is hidden.
- With "reduce motion" on, notes change with a plain fade.

The five notes come from the design canvas ("Hero notes · options"). Each is a `<div class="screen">` in `index.html`.

## Blocks in action (under the hero)

- In the style of sendjolly.com.au's "How it works": each card is a soft landscape with a small Slimnote window floating on it, and the window loops a feature being used, with a named cursor (`<section class="showcase">`). Two cards a row at 1008 wide, one on phones.
- Galleries (a photo is dragged in, then Scrapbook tilts them), Cut-out letters (Lisbon is typed, then cut out letter by letter), Stickers and effects (a sticker is dropped on, then Jitter), Canvas (a sticky note is carried across and back), Tasks (a task goes from Doing to Done), Publish (Publish, Publishing…, Updated, then "Page is live").
- Plain CSS animations; with "reduce motion" on, each card shows one still moment.
- Backgrounds: `assets/img/bg-*.webp` (from the app's photo library).

## Versions

- `versions/v1/`: the first hero as reviewed.
- `versions/v2/`: Figma cursors, typed dynamic text, squared paper (approved 1 Nov 2026).
- `versions/v3/`: task board drags like the real app (works on every loop), Classic photo cards in the process.
- `versions/v4/`: nav as a frosted pill inside the hero (Figma Frame 106); the card fills the screen and the window grows with its width.
- `versions/v5/`: like v4, but everything inside the card scales as one piece to Figma's 1408 × 871 proportions, so the window shows the same share on any screen.
- `versions/v6/`: v5 with a still landscape (`assets/img/hero-landscape.webp`) instead of the video, under the same gradient.
- `versions/v7/`: the hero matched to Figma Frame 107 (before the Blocks section was added).
- The main `index.html` is v7 plus the Blocks section. v7 (Figma Frame 107): the landscape zoomed in as placed in Figma, only the top gradient over it, and the nav pill at Figma's size (622 × 38), scaling with the hero.
- `versions/v9/`: v7 with the Figma Frame 108 Blocks cards (hover animations) under the hero.
- `versions/v8/`: v6 plus frosted sides and a soft glow behind the window (`focus-frost`).

Open any `versions/…/index.html` to compare.
