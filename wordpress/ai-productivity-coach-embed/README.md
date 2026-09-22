# AI Productivity Coach Embed 1.1.1

This single WordPress plugin embeds both public EY-ERIC experiences.

## Existing productivity coach

The original shortcode is unchanged:

```text
[ai_productivity_coach]
```

Its existing `url`, `height`, and `radius` attributes remain available.

## Provider directory

Add the complete public provider experience to a WordPress page, post, or
Elementor Shortcode widget:

```text
[ey_eric_providers]
```

The provider directory, company profiles, posts, whitepapers, webinars and
their public forms navigate inside the same embedded area.

The embedded provider header keeps the Providers control and German/English
language switcher. Login and registration actions remain available on the
standalone EY-ERIC site and are intentionally hidden inside WordPress.

Optional attributes:

```text
[ey_eric_providers lang="de" height="900" min_height="480" max_height="40000" radius="0"]
```

- `lang`: `de` or `en`
- `height`: initial iframe height before EY-ERIC reports its content height
- `min_height`: smallest automatic height
- `max_height`: largest automatic height
- `radius`: iframe corner radius in pixels
- `url`: override the EY-ERIC provider URL for a staging environment; the path
  must remain under `/providers`
- `title`: accessible iframe title

Deploy the corresponding EY-ERIC application changes before using the provider
shortcode so automatic resizing and embed-only header behavior are available.
