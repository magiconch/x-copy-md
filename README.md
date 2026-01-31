# X Copy Tweet as Markdown

Chrome/Edge/Brave extension that adds a right-click menu item on x.com/twitter.com:

- **Copy tweet as Markdown**

Markdown format:
```md
<tweet text>

— @username (https://x.com/username/status/1234567890)
```

If the tweet has images, they are downloaded to `Downloads/X-Copy/` and inserted as local file URLs:
```md
<tweet text>

![](file:///Users/you/Downloads/X-Copy/username-1234567890-01.jpg)

— @username (https://x.com/username/status/1234567890)
```

If the tweet contains a quoted/forwarded tweet, the quoted content is separated and blockquoted, and the quoted tweet link is included:
```md
<main tweet text>

---

> <quoted tweet text>
>
> https://x.com/someone/status/123

— @username (https://x.com/username/status/1234567890)
```

Note: Only the main tweet's images are downloaded to `Downloads/X-Copy/`. Quoted tweet images (if any) remain as remote URLs inside the blockquote.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `x-copy-md/` folder

## Use

1. Go to `https://x.com/` (or `https://twitter.com/`)
2. Right-click inside a tweet
3. Choose **Copy tweet as Markdown**

## Popup settings

Click the extension icon to open the popup:

- **Ctrl/Cmd+C copies tweet as Markdown**
  - When enabled, pressing `Ctrl/Cmd+C` copies the tweet under your cursor as Markdown.
  - If you selected text, default copy behavior is preserved (only selection is copied).
- **Use local images**
  - When enabled, images in the **main tweet** are downloaded to `~/Downloads/X-Copy/` and the Markdown uses `file://...` URLs.
  - When disabled, images use remote `https://pbs.twimg.com/...` URLs and no downloads occur.

## Troubleshooting

- If it says "No tweet article found": right-click on the tweet body (not the sidebar / empty space).
- If it says "Tweet link not found": X DOM may have changed; open an issue and include a screenshot + the tweet URL.
- If images don’t render in your Markdown app: some renderers block `file://` images for security.
- Quoted/retweeted content: this extension tries to copy only the main tweet's own text/images (not nested quoted tweet media).
