(() => {
  // Prevent double-injection.
  const global = globalThis;
  if (global.__chatgpt_export_injected) {
    return;
  }
  global.__chatgpt_export_injected = true;

  const SUPPORTED_ROLES = new Set(["user", "assistant"]);

  function extractConversationId(pathname) {
    const match = pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : "unknown";
  }

  function pruneUiElements(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("button, svg, textarea, input").forEach((el) => el.remove());
    return clone;
  }

  function normalizeSpacing(text) {
    // Collapse 3+ newlines to a single blank line.
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  function renderList(listNode, depth, ordered, addTrailingBlank = true) {
    const indent = "  ".repeat(depth);
    const lines = [];

    Array.from(listNode.children).forEach((li, idx) => {
      if (li.tagName !== "LI") return;
      const { inlineText, nestedText } = renderLi(li, depth);
      const marker = ordered ? `${idx + 1}. ` : "- ";
      lines.push(`${indent}${marker}${inlineText}`);
      if (nestedText) {
        lines.push(nestedText);
      }
    });

    const text = lines.join("\n");
    return addTrailingBlank ? `${text}\n\n` : text;
  }

  function renderLi(liNode, depth) {
    const inlineParts = [];
    const nestedParts = [];

    liNode.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "UL" || child.tagName === "OL")) {
        nestedParts.push(renderList(child, depth + 1, child.tagName === "OL", false));
      } else {
        inlineParts.push(nodeToMarkdown(child, depth + 1));
      }
    });

    const inlineText = inlineParts.join("").trim();
    const nestedText = nestedParts.join("\n").trimEnd();

    return { inlineText, nestedText };
  }

  function nodeToMarkdown(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName;
    const childrenMd = Array.from(node.childNodes)
      .map((child) => nodeToMarkdown(child, depth))
      .join("");

    switch (tag) {
      case "BR":
        return "\n";
      case "P":
        return `${childrenMd}\n\n`;
      case "STRONG":
      case "B":
        return `**${childrenMd}**`;
      case "EM":
      case "I":
        return `*${childrenMd}*`;
      case "CODE":
        if (node.parentElement && node.parentElement.tagName === "PRE") {
          return childrenMd;
        }
        return `\`${childrenMd}\``;
      case "PRE": {
        const codeText = node.textContent || "";
        return `\`\`\`\n${codeText.trim()}\n\`\`\`\n\n`;
      }
      case "UL":
        return renderList(node, depth, false);
      case "OL":
        return renderList(node, depth, true);
      case "LI":
        return childrenMd;
      case "SPAN":
      case "DIV":
      case "SECTION":
      case "ARTICLE":
        return childrenMd;
      default:
        return childrenMd;
    }
  }

  function extractMessageText(node) {
    const cleaned = pruneUiElements(node);
    const markdown = nodeToMarkdown(cleaned);
    return normalizeSpacing(markdown);
  }

  function collectChatgptMessages() {
    const scope = document.querySelector("main") || document.body;
    const nodes = scope.querySelectorAll("div[data-message-author-role]");
    const seen = new Set();
    const messages = [];

    nodes.forEach((node, index) => {
      const role = node.getAttribute("data-message-author-role");
      if (!SUPPORTED_ROLES.has(role)) {
        return;
      }

      const messageId = node.getAttribute("data-message-id") || `${index}-${role}`;
      if (seen.has(messageId)) {
        return;
      }
      seen.add(messageId);

      const content = extractMessageText(node);
      if (!content) {
        return;
      }

      messages.push({
        role,
        content,
      });
    });

    return messages;
  }

  function collectMessages() {
    return collectChatgptMessages();
  }

  function collectConversation() {
    const messages = collectMessages();

    return {
      source: "chatgpt",
      conversationId: extractConversationId(window.location.pathname),
      sourceUrl: window.location.href,
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "collect-conversation") {
      return;
    }

    try {
      const data = collectConversation();
      sendResponse({ ok: true, data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: errorMessage });
    }

    return true;
  });
})();
