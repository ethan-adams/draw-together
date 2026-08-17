package gql

import "net/http"

// PlaygroundHandler serves a tiny, self-contained GraphQL console: a short
// explanation, an editable query pre-filled with a runnable example, a Run
// button, and the JSON result. No CDN, so it works offline and can't drift.
func PlaygroundHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(playgroundPage))
	})
}

const playgroundPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Draw · GraphQL</title>
<style>
  :root { --forest:#1e6b45; --forest2:#2f9e63; --gold:#d4af37; --ink:#1a211d; --paper:#f6f7f4; --line:rgba(20,40,30,.12); }
  * { box-sizing:border-box; }
  body { margin:0; font-family:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; color:var(--ink); background:var(--paper); }
  header { display:flex; align-items:center; gap:12px; padding:16px 22px; background:#12251b; color:#eef2ec; }
  .mark { width:34px; height:34px; border-radius:8px; background:var(--gold); color:#1c1607; font-weight:800; display:grid; place-items:center; font-size:13px; }
  header .t { font-weight:700; font-size:16px; }
  header .s { font-size:13px; color:#b3c1b8; }
  main { max-width:820px; margin:0 auto; padding:22px; }
  .how { font-size:15px; color:#4a564f; }
  .how kbd { font:inherit; font-weight:700; background:#e7eae5; border:1px solid var(--line); border-radius:5px; padding:1px 6px; }
  .ex { display:flex; gap:8px; margin:10px 0 12px; flex-wrap:wrap; }
  .ex button { font:inherit; font-size:13px; font-weight:600; color:var(--ink); background:#fff; border:1px solid var(--line); border-radius:9px; padding:7px 12px; cursor:pointer; }
  .ex button:hover { border-color:var(--forest2); }
  textarea { width:100%; height:190px; font-family:ui-monospace,'SF Mono','JetBrains Mono',Menlo,monospace; font-size:14px; line-height:1.5; color:var(--ink); background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; outline:none; resize:vertical; }
  textarea:focus { border-color:var(--forest2); box-shadow:0 0 0 3px rgba(108,199,154,.35); }
  .row { display:flex; align-items:center; gap:12px; margin:12px 0; }
  #run { font:inherit; font-weight:700; font-size:14px; color:#eafff2; background:var(--forest2); border:none; border-radius:10px; padding:10px 18px; cursor:pointer; }
  #run:hover { background:var(--forest); }
  #status { font-size:13px; color:#7f8f85; }
  pre { background:#0f1a14; color:#e6efe9; border-radius:12px; padding:16px; overflow:auto; font-size:13px; line-height:1.5; min-height:60px; }
  .foot { font-size:13px; color:#7f8f85; margin-top:14px; }
  code { font-family:ui-monospace,monospace; }
</style>
</head>
<body>
<header>
  <div class="mark">EA</div>
  <div>
    <div class="t">Draw · GraphQL control plane</div>
    <div class="s">The cold path — list &amp; create boards. The live drawing runs over WebSocket, not here.</div>
  </div>
</header>
<main>
  <p class="how">Edit the query below and press <b>Run</b> (or <kbd>&#8984;/Ctrl</kbd>+<kbd>Enter</kbd>). Load an example:</p>
  <div class="ex">
    <button onclick="setQ(Q_LIST)">List boards</button>
    <button onclick="setQ(Q_CREATE)">Create a board</button>
    <button onclick="setQ(Q_SDL)">Federation SDL</button>
  </div>
  <textarea id="q" spellcheck="false"></textarea>
  <div class="row"><button id="run" onclick="run()">&#9654; Run</button><span id="status"></span></div>
  <pre id="out">Press Run to see the result.</pre>
  <p class="foot">The schema is federation-ready — <code>Board</code> is an entity with <code>@key(fields:&nbsp;"id")</code>, so it can compose into a supergraph. See <code>GRAPHQL.md</code> in the repo.</p>
</main>
<script>
  var Q_LIST = "query Boards {\n  boards {\n    id\n    title\n    objectCount\n    lastActiveAt\n  }\n}";
  var Q_CREATE = "mutation NewBoard {\n  createBoard(title: \"Scratchpad\") {\n    id\n    title\n    createdAt\n  }\n}";
  var Q_SDL = "query Subgraph {\n  _service {\n    sdl\n  }\n}";
  var q = document.getElementById("q");
  q.value = Q_LIST;
  function setQ(v) { q.value = v; q.focus(); }
  async function run() {
    var out = document.getElementById("out"), st = document.getElementById("status");
    st.textContent = "running…";
    try {
      var res = await fetch("/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q.value }) });
      var json = await res.json();
      out.textContent = JSON.stringify(json, null, 2);
      st.textContent = "";
    } catch (e) { out.textContent = String(e); st.textContent = "error"; }
  }
  q.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); } });
</script>
</body>
</html>`
