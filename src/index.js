async function incrementCounter(kv, key) {
  const existing = await kv.get(key, 'json') || { counter: 0 };
  const counter = existing.counter + 1;
  await kv.put(key, JSON.stringify({ counter, lastHit: new Date().toISOString() }));
  return counter;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
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
