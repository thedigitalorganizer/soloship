# Accessibility Checklist

Canonical reference for accessibility reviews. Used by `/review`, `/design-review`, `/qa`.

## Keyboard Navigation

- [ ] All interactive elements reachable via Tab
- [ ] Focus order follows visual order
- [ ] Focus indicator visible (never `outline: none` without replacement)
- [ ] Escape closes modals/popups and returns focus to trigger
- [ ] No keyboard traps (user can always Tab away)

## Screen Readers

- [ ] All images have `alt` text (decorative images: `alt=""`)
- [ ] Form inputs have associated `<label>` elements
- [ ] ARIA labels on icon-only buttons (`aria-label="Close"`)
- [ ] Landmark regions used (`<nav>`, `<main>`, `<aside>`, `<footer>`)
- [ ] Dynamic content updates announced (`aria-live` regions)
- [ ] Page has a descriptive `<title>`

## Visual

- [ ] Color contrast meets WCAG AA (4.5:1 normal text, 3:1 large text)
- [ ] Information not conveyed by color alone (icons, text, patterns too)
- [ ] Text resizable to 200% without layout breaking
- [ ] No content requires horizontal scrolling at 320px viewport

## Interactive Elements

- [ ] Buttons use `<button>`, links use `<a>` (not `<div onclick>`)
- [ ] Error messages linked to their form fields (`aria-describedby`)
- [ ] Loading states communicated (spinner + `aria-busy="true"`)
- [ ] Disabled elements explain why (tooltip or adjacent text)

## Motion

- [ ] Animations respect `prefers-reduced-motion`
- [ ] No auto-playing video/audio without controls
- [ ] No content flashes more than 3 times per second
