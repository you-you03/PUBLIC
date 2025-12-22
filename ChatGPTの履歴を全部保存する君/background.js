async function requestConversation(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "collect-conversation" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.ok && response?.data) {
        resolve(response.data);
      } else {
        reject(
          new Error(
            response?.error ||
              "メッセージを取得できませんでした。ページを上までスクロールしてから再試行してください。"
          )
        );
      }
    });
  });
}

function pad(num) {
  return num.toString().padStart(2, "0");
}

function roleLabel(role) {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  return role;
}

function normalizeMessageContent(text) {
  const trimmed = (text || "").trim();
  // Collapse 3+ newlines to a single blank line.
  return trimmed.replace(/\n{3,}/g, "\n\n");
}

function sanitizeTitle(title, fallback) {
  const base = (title || "").trim();
  if (!base) return fallback;
  const collapsed = base.replace(/\s+/g, "_");
  const stripped = collapsed.replace(/[^a-zA-Z0-9_\-一-龠ぁ-んァ-ヶ]/g, "");
  const trimmed = stripped.substring(0, 32) || fallback;
  return trimmed;
}

function buildFullSection(conversation) {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lines = [];

  messages.forEach((message, index) => {
    lines.push(`#### ${index + 1}. ${roleLabel(message.role)}`);
    lines.push("");
    lines.push(normalizeMessageContent(message.content));
    lines.push("");
  });

  return lines.join("\n");
}

async function downloadMarkdown(markdown, filename) {
  // Service Worker環境ではURL.createObjectURLが使えない場合があるためdata URLで対応。
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: "uniquify",
  });
}

function buildFullMarkdownDocument(conversation) {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const messageCount = messages.length;
  const lines = [];
  lines.push("# ChatGPT Conversation (Full Export)");
  lines.push("");
  lines.push(`- Exported: ${conversation.exportedAt}`);
  lines.push(`- Source URL: ${conversation.sourceUrl}`);
  lines.push(`- Conversation ID: ${conversation.conversationId}`);
  lines.push("- Range: Visible messages on page");
  lines.push(`- Message Count: ${messageCount}`);
  lines.push("\n---\n");
  lines.push(buildFullSection(conversation));
  return { markdown: lines.join("\n"), title: "ChatGPT Conversation" };
}

function buildFilename(titleOrId, source = "chatgpt") {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const safe = sanitizeTitle(titleOrId, "chatgpt");
  return `${date}_${safe}.md`;
}

async function startExportFromTab(tab) {
  if (!tab?.id || !tab.url) {
    throw new Error("アクティブなタブを取得できませんでした。");
  }

  const isChatgpt =
    tab.url.includes("chatgpt.com") || tab.url.includes("chat.openai.com");
  if (!isChatgpt) {
    throw new Error("ChatGPTのスレッドページで実行してください。");
  }

  // 念のため content script を明示的に注入してからメッセージを送る
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (_e) {
    // ここでの失敗はそのまま後続の sendMessage エラーとして扱う
  }

  const conversation = await requestConversation(tab.id);
  if (!conversation.messages.length) {
    throw new Error(
      "メッセージを取得できませんでした。ページを上までスクロールしてから再試行してください。"
    );
  }

  const output = buildFullMarkdownDocument(conversation);

  const defaultTitles = [
    "ChatGPT Conversation",
    "ChatGPT Conversation (Full Export)",
  ];
  const titleForFilename =
    output.title && !defaultTitles.includes(output.title)
      ? output.title
      : conversation.conversationId || "conversation";

  const filename = buildFilename(titleForFilename, "chatgpt");
  await downloadMarkdown(output.markdown, filename);
}

chrome.action.onClicked.addListener((tab) => {
  startExportFromTab(tab).catch((error) => {
    const message =
      error instanceof Error ? error.message : String(error || "Unknown error");
    console.error("[ChatGPT Markdown Exporter] export failed:", message);
  });
});
