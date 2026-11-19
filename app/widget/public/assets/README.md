# Widget emoji assets

Deployment copies, not sources of truth.

| File | Copied from |
|---|---|
| `emoji-data.json` | `app/admin/src/lib/emoji-data.json` |
| `chat-emoji-fill.woff2` | `app/admin/public/fonts/chat-emoji-fill.woff2` |

The admin panel and the widget must show the same emoji with the same labels,
so both read from these two files. Edit the source under `app/admin` and copy
again — never edit the copies here:

```powershell
Copy-Item app/admin/src/lib/emoji-data.json        app/widget/public/assets/emoji-data.json -Force
Copy-Item app/admin/public/fonts/chat-emoji-fill.woff2 app/widget/public/assets/chat-emoji-fill.woff2 -Force
```

`vite build` copies this directory to `dist/assets/`, and the api serves it at
`/v1/assets/` (see `app/api/src/widget/widget-asset.service.ts`). The
`unicode-range` in `app/widget/src/emoji-assets.ts` is the same one as in
`app/admin/src/app/globals.css`; if the font subset is rebuilt, that range has
to be updated in both places.
