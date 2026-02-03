# X Copy Tweet as Markdown

**Save Twitter/X tweets to Obsidian with one click!**

A Chrome/Edge/Brave browser extension that lets you easily copy Twitter/X tweets as Markdown format, perfectly compatible with Obsidian note-taking system.

## Core Features

- **Right-click to copy tweets as Markdown** - Right-click on any tweet on x.com/twitter.com to copy
- **Perfect for Obsidian** - Generated Markdown can be pasted directly into Obsidian notes
- **Local image storage** - Automatically downloads tweet images locally for perfect display in Obsidian
- **Keyboard shortcut support** - Optional Ctrl/Cmd+C quick copy

## Markdown Format Examples

Basic tweet format:
```md
<tweet text>

— @username (https://x.com/username/status/1234567890)
```

Tweet with images (images automatically downloaded locally for offline viewing in Obsidian):
```md
<tweet text>

![](file:///Users/you/Downloads/X-Copy/username-1234567890-01.jpg)

— @username (https://x.com/username/status/1234567890)
```

Tweet with quoted content:
```md
<main tweet text>

---

> <quoted tweet text>
>
> https://x.com/someone/status/123

— @username (https://x.com/username/status/1234567890)
```

**Note**: Only the main tweet's images are downloaded to the `Downloads/X-Copy/` directory. Quoted tweet images (if any) remain as remote URLs.

## Why Perfect for Obsidian?

- ✅ **Native Markdown format** - No conversion needed, paste directly into Obsidian
- ✅ **Local image storage** - Images saved locally, notes remain accessible forever
- ✅ **Preserves tweet links** - Easy to trace back to original source
- ✅ **Clear quote formatting** - Quoted tweets use blockquotes for clear hierarchy

## Installation (Developer Mode)

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Run `npm run build`
5. Select the `dist/extension/` folder

## How to Use

1. Visit `https://x.com/` (or `https://twitter.com/`)
2. Right-click on a tweet
3. Select **Copy tweet as Markdown**
4. Open Obsidian and paste into your note

## Extension Settings

Click the extension icon to open the settings panel:

- **Ctrl/Cmd+C copies tweet as Markdown**
  - When enabled, pressing `Ctrl/Cmd+C` copies the tweet under your cursor as Markdown
  - If you have text selected, default copy behavior is preserved (only selection is copied)
- **Use local images**
  - When enabled, **main tweet** images are downloaded to `~/Downloads/X-Copy/`, Markdown uses `file://...` local paths
  - When disabled, images use remote `https://pbs.twimg.com/...` URLs and no downloads occur

## Troubleshooting

- **"No tweet article found" error**: Right-click on the tweet body (not the sidebar or empty space)
- **"Tweet link not found" error**: X/Twitter DOM structure may have changed; please open an issue with a screenshot and tweet URL
- **Images don't render in Markdown app**: Some renderers block `file://` images for security reasons
  - **Obsidian users**: Obsidian supports local images by default, just ensure the image path is correct
- **Quoted/retweeted content**: This extension copies only the main tweet's text and images (not nested quoted tweet media)

---

**Start using it now and save your favorite Twitter content permanently in Obsidian!** 📝✨
