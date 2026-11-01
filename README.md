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
| `index.html` | The page. Right now: the nav and the hero. |
| `css/site.css` | All styles. Sizes follow Figma "Notes App" › Frame 100 (1440 wide). |
| `js/hero.js` | The hero: shows one note after another in the Mac window, each building itself in. |
| `assets/video/hero.mp4` | The landscape background video (with `hero-poster.jpg` as its first frame). |
| `assets/img/` | Logo, photos and stickers used by the notes in the window. |

## The hero

- The window is a full 1440 × 900 Mac screen, scaled down to fit (about 948 px wide on desktop).
- Five notes take turns, about 5.6 seconds each: photo cover + process, scrapbook gallery, dynamic text, tasks + canvas, publishing.
- The dots in the corner jump to a note.
- It pauses when the hero is off screen or the tab is hidden.
- With "reduce motion" on, notes change with a plain fade.

The five notes come from the design canvas ("Hero notes · options"). Each is a `<div class="screen">` in `index.html`.
