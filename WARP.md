# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview

This is a small, static front-end project implemented with plain HTML, CSS, and JavaScript. The app visualizes how "out of tune" a pitch is by mapping a slider value (in cents) to animated, wiggling friend avatars whose intensity increases as the pitch offset grows.

## Running and developing the app

There is no build step, package manager config, or test setup in this repository; everything runs directly in the browser.

Typical ways to run the app locally:

- **Open directly in a browser** (no server required)
  - Open `index.html` in any modern browser.
- **Serve via a simple static server** (useful for local hosting on `localhost`)
  - With Node.js available:
    - `npx serve .`
  - With Python available:
    - `python -m http.server 8000`

There are no predefined lint or test commands. If you introduce tooling (e.g., ESLint, Jest, Vite), extend this file with the new commands.

## Code architecture and data flow

### HTML structure (`index.html`)

- Single-page layout with a root `.app` container that holds:
  - A title and subtitle explaining that "wiggle level" reflects how out of tune the pitch is.
  - A **tuner section** containing:
    - A range input (`#tuner-slider`, from -50 to +50 cents) that represents pitch offset.
    - A label showing the current offset value (`#tuner-value`).
    - A simple scale display for the slider bounds and "In tune" center.
  - A **friends section** containing four `.friend` cards (Armaan, Arnav, Aryan, Ishanth), each with:
    - A `.face` element used purely as a visual avatar.
    - A `.name` label.
- The `.friend` elements are the logical units that react to tuning; they are identified via DOM queries in `main.js` and styled/animated via CSS.

### Behavior and animation (`main.js`)

All behavior is wired up inside a `DOMContentLoaded` handler so that DOM queries are safe:

- **Core elements and state**
  - Grabs references to `#tuner-slider`, `#tuner-value`, and all `.friend` elements.
  - Maintains a single `amplitude` variable that controls how intense the wiggle animation is.

- **Mapping slider offset to visual intensity**
  - `mapOffsetToAmplitude(offset)` converts the current slider value (in cents) to a numeric amplitude (0.5–18) using a normalized 0–1 scale based on the max offset (50).
  - `classifyIntensity(offset)` turns the absolute offset into discrete buckets: `'low'`, `'medium'`, `'high'`, `'max'`.
  - `updateFromSlider()` is the main update function:
    - Reads `slider.value` and updates `#tuner-value` text.
    - Updates the global `amplitude` using `mapOffsetToAmplitude`.
    - Computes the intensity label and sets a `data-intensity` attribute on each `.friend` element.
  - The slider listens to the `input` event, calling `updateFromSlider` continuously as the user drags. An initial call ensures the UI is in sync on load.

- **Animation loop**
  - A `tick()` function runs on every animation frame via `requestAnimationFrame(tick)`.
  - For each friend:
    - Locates the `.face` child and computes a time-based `phase` using `performance.now()` and the friend's index (to desynchronize them).
    - Derives `wobbleX`, `wobbleY`, and `rotate` values from sine/cosine of the phase, scaled by the shared `amplitude`.
    - Applies a `transform` on the `.face` element using `translate(...) rotate(...)`, with values rounded via `toFixed(2)`.
  - Because the loop uses the shared `amplitude`, adjusting the slider smoothly scales the wiggle intensity across all friends without restarting the animation.

### Styling and visual states (`style.css`)

- **Layout and theming**
  - Global reset for `box-sizing`, with a full-page radial gradient background and system UI fonts.
  - `.app` provides a centered, responsive content area.
  - `.tuner` and `.friend` cards share a glassy, dark-themed panel aesthetic with rounded corners, borders, and shadows.

- **Faces and expressions**
  - `.face` is a circular avatar with a yellow gradient and border/shadow, positioned relative to support facial features.
  - Eyes are created with `::before` and `::after` pseudo-elements; a `.face-mouth` element (if present inside `.face`) renders a simple arc-style mouth using border styling.

- **Intensity-driven styles**
  - The intensity classification from `main.js` is bridged into styling via `data-intensity` attributes on `.friend`:
    - `.friend[data-intensity='low'] .face` reduces saturation.
    - `.friend[data-intensity='medium'] .face` slightly boosts saturation.
    - `.friend[data-intensity='high'] .face` adds more saturation and contrast.
    - `.friend[data-intensity='max'] .face` further increases saturation, contrast, and brightness.
  - This creates a clear, CSS-only visual mapping between the JS-derived intensity bucket and each friend's appearance.

- **Responsiveness**
  - A `@media (max-width: 600px)` block tightens padding for `.app` and `.friend` to keep the layout comfortable on small screens.

## Extending this project

- If you introduce a build system (e.g., bundler, framework, or test runner), update this file with the exact commands for building, linting, and testing.
- Preserve the separation of concerns used here: HTML for structure, CSS for visual state (including intensity variations), and JavaScript for data flow and animation logic.
