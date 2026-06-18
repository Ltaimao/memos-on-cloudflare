(function () {
  "use strict";

  var INSTANCE_URL, TOKEN, VISIBILITY;
  var script = document.currentScript;
  if (script) {
    var url = new URL(script.src);
    INSTANCE_URL = url.searchParams.get("url") || "";
    TOKEN = url.searchParams.get("token") || "";
    VISIBILITY = url.searchParams.get("visibility") || "PRIVATE";
  }
  if (!INSTANCE_URL || !TOKEN) return;

  // ── Load dependencies from CDN ──────────────────────────────────
  var CACHE = "?cache-bust=" + Date.now();
  var READABILITY_URL =
    "https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5/Readability.js";
  var TURNDOWN_URL =
    "https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src + CACHE;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── Utility: get selected text with context ─────────────────────
  function getSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return "";
    return sel.toString().trim();
  }

  // ── Utility: build memo content ─────────────────────────────────
  function buildMemoContent(title, url, bodyHtml, selection) {
    var lines = ["[" + title + "](" + url + ")"];
    if (selection) {
      lines.push("");
      lines.push("> " + selection.replace(/\n/g, "\n> "));
    }
    if (bodyHtml) {
      try {
        var turndownService = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
          emDelimiter: "*",
        });
        var markdown = turndownService.turndown(bodyHtml);
        if (markdown) {
          lines.push("");
          lines.push("---");
          lines.push("");
          lines.push(markdown);
        }
      } catch (e) {
        // fallback: extract text content
        var tmp = document.createElement("div");
        tmp.innerHTML = bodyHtml;
        var text = tmp.textContent || tmp.innerText || "";
        text = text.replace(/\s+/g, " ").trim();
        if (text) {
          lines.push("");
          lines.push("---");
          lines.push("");
          lines.push(text.substring(0, 5000));
        }
      }
    }
    return lines.join("\n");
  }

  // ── Utility: save to API ────────────────────────────────────────
  function saveMemo(content, successFn, errorFn) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", INSTANCE_URL + "/api/v1/memos", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", "Bearer " + TOKEN);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var memo = JSON.parse(xhr.responseText);
          successFn(memo);
        } catch (e) {
          successFn(null);
        }
      } else {
        errorFn(xhr.status);
      }
    };
    xhr.onerror = function () {
      errorFn(0);
    };
    xhr.send(
      JSON.stringify({
        content: content,
        visibility: VISIBILITY,
      })
    );
  }

  // ── Shadow DOM Popup UI ─────────────────────────────────────────
  function createPopup(title, content, memoUrl) {
    var host = document.createElement("div");
    host.id = "memos-clipper-host";
    var root = host.attachShadow({ mode: "open" });

    // Styles
    var style = document.createElement("style");
    style.textContent =
      `
      :host * { box-sizing: border-box; margin: 0; padding: 0; }
      #overlay {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px; line-height: 1.5; color: #1f2937;
        width: 420px; max-width: calc(100vw - 48px);
        background: #fff; border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
        overflow: hidden; animation: slideUp 0.2s ease-out;
      }
      @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      #header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
      #header span { font-weight: 600; font-size: 13px; color: #374151; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #header .close { cursor: pointer; background: none; border: none; font-size: 20px; color: #9ca3af; padding: 0 4px; line-height: 1; }
      #header .close:hover { color: #4b5563; }
      #body { padding: 12px 16px; max-height: 70vh; display: flex; flex-direction: column; gap: 8px; }
      #preview { flex: 1; min-height: 120px; resize: vertical; width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; line-height: 1.6; color: #1f2937; outline: none; background: #fff; }
      #preview:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
      #footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 16px 12px; }
      #char-count { font-size: 12px; color: #9ca3af; }
      #char-count.warning { color: #ef4444; }
      #actions { display: flex; gap: 8px; }
      .btn { padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: background 0.15s; }
      .btn-primary { background: #6366f1; color: #fff; }
      .btn-primary:hover { background: #4f46e5; }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-secondary { background: #f3f4f6; color: #374151; }
      .btn-secondary:hover { background: #e5e7eb; }
      #success {
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
        background: #059669; color: #fff; padding: 12px 20px; border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px; font-weight: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        cursor: pointer; animation: slideUp 0.2s ease-out;
      }
      #success:hover { background: #047857; }
      .error-text { font-size: 12px; color: #ef4444; }
    `;
    root.appendChild(style);

    // Overlay container
    var overlay = document.createElement("div");
    overlay.id = "overlay";
    root.appendChild(overlay);

    // Header
    var header = document.createElement("div");
    header.id = "header";
    header.innerHTML =
      '<span>📎 ' +
      escapeHtml(title) +
      "</span><button class='close' id='closeBtn'>&times;</button>";
    overlay.appendChild(header);

    // Body
    var body = document.createElement("div");
    body.id = "body";
    var textarea = document.createElement("textarea");
    textarea.id = "preview";
    textarea.value = content;
    textarea.placeholder = "Edit your post before saving...";
    body.appendChild(textarea);
    overlay.appendChild(body);

    // Footer
    var footer = document.createElement("div");
    footer.id = "footer";
    var charCount = document.createElement("span");
    charCount.id = "char-count";
    charCount.textContent = content.length + " chars";
    footer.appendChild(charCount);

    var actions = document.createElement("div");
    actions.id = "actions";
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancel";
    actions.appendChild(cancelBtn);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary";
    saveBtn.textContent = "Save to Memos";
    actions.appendChild(saveBtn);
    footer.appendChild(actions);
    overlay.appendChild(footer);

    document.body.appendChild(host);

    // ── Event handlers ───────────────────────
    function updateCharCount() {
      var len = textarea.value.length;
      charCount.textContent = len + " chars";
      if (len > 2000) {
        charCount.className = "warning";
      } else {
        charCount.className = "";
      }
    }

    textarea.addEventListener("input", updateCharCount);

    function close() {
      if (host.parentNode) host.parentNode.removeChild(host);
    }

    root.getElementById("closeBtn").addEventListener("click", close);
    cancelBtn.addEventListener("click", close);

    saveBtn.addEventListener("click", function () {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      saveMemo(
        textarea.value,
        function (memo) {
          close();
          showSuccess(memoUrl || (memo ? memo.name : null));
        },
        function () {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save to Memos";
          var err = document.createElement("div");
          err.className = "error-text";
          err.textContent = "Failed to save. Check your connection and token.";
          var existingError = root.querySelector(".error-text");
          if (existingError) existingError.remove();
          body.appendChild(err);
        }
      );
    });

    // Focus textarea
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function showSuccess(memoId) {
    var div = document.createElement("div");
    div.id = "success";
    div.textContent = "✅ Saved to Memos";
    if (memoId && memoId !== "undefined") {
      div.style.cursor = "pointer";
      div.title = "Open memo";
    }
    document.body.appendChild(div);
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 4000);
  }

  function escapeHtml(text) {
    var d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  // ── Main ────────────────────────────────────────────────────────
  function run() {
    var title = document.title || "";
    var url = window.location.href;
    var selection = getSelection();
    var bodyHtml = "";

    // Extract article body using Readability
    try {
      var documentClone = document.cloneNode(true);
      var reader = new Readability(documentClone);
      var article = reader.parse();
      if (article && article.content) {
        bodyHtml = article.content;
        if (article.title) title = article.title;
      }
    } catch (e) {
      // fallback: use <body> content
      try {
        bodyHtml = document.body.innerHTML;
      } catch (e2) {
        // no fallback
      }
    }

    var content = buildMemoContent(title, url, bodyHtml, selection);
    var memoUrl = INSTANCE_URL + "/memos/";
    createPopup(title, content, memoUrl);
  }

  // ── Bootstrap: load deps then run ───────────────────────────────
  Promise.all([loadScript(READABILITY_URL), loadScript(TURNDOWN_URL)])
    .then(run)
    .catch(function () {
      // If CDN fails, still show popup with basic content
      run();
    });
})();
