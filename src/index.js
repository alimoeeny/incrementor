async function incrementCounter(kv, key) {
  const existing = await kv.get(key, 'json') || { counter: 0 };
  const counter = existing.counter + 1;
  await kv.put(key, JSON.stringify({ counter, lastHit: new Date().toISOString() }));
  return counter;
}

async function getCounter(kv, key) {
  const existing = await kv.get(key, 'json');
  return existing ? existing.counter : 0;
}

function getIndexPage(baseUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Incrementor - Hit Counter</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .counter-box {
      background: #fff;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin: 20px 0;
    }
    .counter-label { color: #666; font-size: 14px; }
    #incrementor-aggregate-counter {
      font-size: 48px;
      font-weight: bold;
      color: #2563eb;
    }
    code {
      background: #e5e5e5;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
    }
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>Incrementor</h1>
  <p>A simple hit counter for your pages.</p>

  <div class="counter-box">
    <div class="counter-label">This page has been viewed</div>
    <div id="incrementor-aggregate-counter">...</div>
    <div class="counter-label">times</div>
  </div>

  <h2>Usage</h2>
  <p>Add this to your page:</p>
  <pre>&lt;div id="incrementor-aggregate-counter"&gt;&lt;/div&gt;
&lt;script src="${baseUrl}/embed.js" data-key="your-key"&gt;&lt;/script&gt;</pre>

  <p>Or just track hits without displaying:</p>
  <pre>&lt;img src="${baseUrl}/your-key" width="1" height="1" /&gt;</pre>

  <script src="${baseUrl}/embed.js" data-key="demo"></script>
</body>
</html>`;
}

function getEmbedScript(baseUrl) {
  return `(function() {
  var script = document.currentScript;
  var key = script && script.getAttribute('data-key');
  if (!key) {
    console.error('incrementor: missing data-key attribute');
    return;
  }
  var baseUrl = '${baseUrl}';
  var incrementUrl = baseUrl + '/' + encodeURIComponent(key);

  function run() {
    // Check if already initialized
    if (window.__incrementorInitialized) return;
    window.__incrementorInitialized = true;

    // Check for existing image tag pointing to increment endpoint
    var imgs = document.getElementsByTagName('img');
    var found = false;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].src.indexOf(incrementUrl) !== -1) {
        found = true;
        break;
      }
    }

    function displayCounter() {
      fetch(baseUrl + '/read/' + encodeURIComponent(key))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var el = document.getElementById('incrementor-aggregate-counter');
          if (el) {
            el.textContent = data.counters.total;
          }
        })
        .catch(function(e) { console.error('incrementor:', e); });
    }

    // Inject image pixel if not found, then display counter
    if (!found) {
      var img = document.createElement('img');
      img.width = 1;
      img.height = 1;
      img.style.position = 'absolute';
      img.style.left = '-9999px';
      img.onload = img.onerror = displayCounter;
      img.src = incrementUrl + '?page=' + encodeURIComponent(location.href);
      document.body.appendChild(img);
    } else {
      displayCounter();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const baseUrl = url.origin;

    // Serve index page
    if (url.pathname === '/') {
      return new Response(getIndexPage(baseUrl), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Serve embed script
    if (url.pathname === '/embed.js') {
      return new Response(getEmbedScript(baseUrl), {
        headers: {
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Read-only endpoint: /read/{key}
    if (pathParts[0] === 'read' && pathParts[1]) {
      const key = pathParts[1];
      const counters = { total: await getCounter(env.COUNTER_KV, key) };
      return new Response(JSON.stringify({ key, counters }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const key = pathParts[0];

    if (!key) {
      return new Response(JSON.stringify({ error: 'No key provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get origin info from headers or query param fallback
    const referer = request.headers.get('Referer') || url.searchParams.get('page');
    let domain = null;
    let page = null;

    if (referer) {
      try {
        const refererUrl = new URL(referer);
        domain = refererUrl.hostname;
        page = refererUrl.pathname;
      } catch {
        // Invalid URL, ignore
      }
    }

    // Increment all relevant counters in parallel
    const counters = {};
    const promises = [];

    // Main counter: my-key
    promises.push(
      incrementCounter(env.COUNTER_KV, key).then(c => counters.total = c)
    );

    // Domain counter: my-key:example.com
    if (domain) {
      const domainKey = `${key}:${domain}`;
      promises.push(
        incrementCounter(env.COUNTER_KV, domainKey).then(c => counters.domain = c)
      );

      // Page counter: my-key:example.com:/blog/post
      if (page) {
        const pageKey = `${key}:${domain}:${page}`;
        promises.push(
          incrementCounter(env.COUNTER_KV, pageKey).then(c => counters.page = c)
        );
      }
    }

    await Promise.all(promises);

    return new Response(JSON.stringify({ key, domain, page, counters }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
