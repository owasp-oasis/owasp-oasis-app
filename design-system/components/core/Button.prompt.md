Button — the single action primitive for site and Workspace; use primary (green) once per view.
```jsx
<Button variant="primary" iconRight={<ArrowRight size={17} strokeWidth={2.25}/>}>Start reviewing</Button>
<Button variant="quiet" size="md">Browse all fixes</Button>
```
Variants: primary, secondary, outline, quiet, ghost-light (on gradient). Sizes: lg 42px (default), md 38px (Workspace toolbars/banners). Hover = opacity .9 + translateY(-1px).
