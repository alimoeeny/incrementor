# incrementor

A simple hit counter as a Cloudflare Worker with hierarchical tracking.

## Features

- Tracks total hits per key
- Tracks hits per domain
- Tracks hits per domain + page path
- Auto-detects source via Referer header
- Query param fallback when Referer is blocked

## Usage

### Basic hit tracking

```html
<script>
  fetch('https://your-worker.workers.dev/my-key')
</script>
```

### With explicit page URL (fallback for when Referer is blocked)

```html
<script>
  fetch('https://your-worker.workers.dev/my-key?page=' + encodeURIComponent(location.href))
</script>
```

### As an image pixel

```html
<img src="https://your-worker.workers.dev/my-key" width="1" height="1" />
```

### Display counter with embed script

Add a div where you want the counter displayed:

```html
<div id="incrementor-aggregate-counter"></div>
<script src="https://your-worker.workers.dev/embed.js" data-key="my-key"></script>
```

The script will fetch the counter (without incrementing) and set the div's text to the total count.

## Response

```json
{
  "key": "my-key",
  "domain": "example.com",
  "page": "/blog/post",
  "counters": {
    "total": 150,
    "domain": 42,
    "page": 7
  }
}
```

## KV Keys Structure

| Key Pattern | Example | Tracks |
|-------------|---------|--------|
| `{key}` | `my-key` | Total hits across all sources |
| `{key}:{domain}` | `my-key:example.com` | Hits from that domain |
| `{key}:{domain}:{path}` | `my-key:example.com:/blog/post` | Hits from that specific page |

## Development

```bash
npm run dev
```

## Environment

Requires `CLOUDFLARE_API_TOKEN` secret for GitHub Actions deployment.
