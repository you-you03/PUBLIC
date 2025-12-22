'use strict';

(function () {
  const form = document.getElementById('clip-form');
  const urlInput = document.getElementById('url-input');
  const tagsInput = document.getElementById('tags-input');
  const submitButton = document.getElementById('submit-button');
  const errorBox = document.getElementById('error-box');
  const resultsSection = document.getElementById('results-section');
  const statsLabel = document.getElementById('stats-label');
  const downloadLink = document.getElementById('download-link');
  const resultList = document.getElementById('result-list');

  const MAX_URLS = 50;
  const CONCURRENCY = 5;
  const DEFAULT_HEADERS = {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.9',
  };

  let currentDownloadUrl = null;

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    hr: '---',
  });
  turndownService.use(turndownPluginGfm.gfm);
  turndownService.addRule('keepFigures', {
    filter: 'figure',
    replacement: (content) => content,
  });
  turndownService.addRule('preservePreCode', {
    filter: (node) => {
      return (
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE' &&
        node.childNodes.length === 1
      );
    },
    replacement: (_content, node) => {
      const firstChild = node.firstChild;
      const codeLanguage = firstChild && firstChild.getAttribute('class');
      const langMatch = codeLanguage && codeLanguage.match(/language-(\w+)/);
      const fenceLang = langMatch ? langMatch[1] : '';
      return `\`\`\`${fenceLang}\n${node.textContent || ''}\n\`\`\`\n`;
    },
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();
    resetResults();
    resetDownload();

    const urls = parseUrlList(urlInput.value);
    if (urls.length === 0) {
      showError('URLを1件以上入力してください。');
      return;
    }
    if (urls.length > MAX_URLS) {
      showError('Maximum 50 URLs per batch.');
      return;
    }

    setLoading(true);

    const tags = parseTags(tagsInput.value);

    try {
      const { results, zip } = await clipBatch({ urls, tags });
      renderResults(results);
      if (zip) {
        prepareDownload(zip);
      } else {
        downloadLink.classList.add('hidden');
      }
    } catch (error) {
      showError(
        error instanceof Error ? error.message : '不明なエラーが発生しました。',
      );
    } finally {
      setLoading(false);
    }
  });

  function setLoading(loading) {
    if (loading) {
      submitButton.textContent = '処理中…';
      submitButton.disabled = true;
    } else {
      submitButton.textContent = 'Markdownを生成';
      submitButton.disabled = false;
    }
  }

  function parseUrlList(raw) {
    return Array.from(
      new Set(
        raw
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  function parseTags(raw) {
    return raw
      .split(/[,、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function hideError() {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  function resetResults() {
    resultsSection.classList.add('hidden');
    resultList.innerHTML = '';
    statsLabel.textContent = '成功 0 件 / 失敗 0 件';
  }

  function resetDownload() {
    if (currentDownloadUrl) {
      URL.revokeObjectURL(currentDownloadUrl);
      currentDownloadUrl = null;
    }
    downloadLink.classList.add('hidden');
    downloadLink.removeAttribute('href');
  }

  function renderResults(results) {
    if (!Array.isArray(results) || results.length === 0) {
      resultsSection.classList.add('hidden');
      return;
    }

    resultsSection.classList.remove('hidden');
    resultList.innerHTML = '';

    let success = 0;
    let failed = 0;

    results.forEach((result) => {
      const item = document.createElement('li');
      item.className = 'result-item';

      const urlLine = document.createElement('p');
      urlLine.className = 'result-url';
      urlLine.textContent = result.url;
      item.appendChild(urlLine);

      if (result.ok && result.fileName) {
        const successLine = document.createElement('p');
        successLine.className = 'result-success';
        successLine.textContent = `✅ ${result.fileName}`;
        item.appendChild(successLine);
        success += 1;
      } else {
        const errorLine = document.createElement('p');
        errorLine.className = 'result-error';
        errorLine.textContent = `⚠️ ${result.error || '詳細不明のエラー'}`;
        item.appendChild(errorLine);
        failed += 1;
      }

      resultList.appendChild(item);
    });

    statsLabel.textContent = `成功 ${success} 件 / 失敗 ${failed} 件`;
  }

  function prepareDownload(zipUint8) {
    resetDownload();
    const blob = new Blob([zipUint8], { type: 'application/zip' });
    currentDownloadUrl = URL.createObjectURL(blob);

    const now = new Date();
    const name = `clips-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.zip`;

    downloadLink.href = currentDownloadUrl;
    downloadLink.download = name;
    downloadLink.classList.remove('hidden');
  }

  async function clipBatch(input) {
    const results = new Array(input.urls.length);
    const successes = [];
    let index = 0;

    async function worker() {
      while (true) {
        const currentIndex = index;
        if (currentIndex >= input.urls.length) {
          return;
        }
        index += 1;
        const url = input.urls[currentIndex];
        try {
          const html = await fetchWithRetry(url);
          const { articleHtml, meta } = await extractArticle(url, html);
          const markdownBody = htmlToMarkdown(articleHtml);
          const frontMatter = buildFrontMatter(meta, input.tags, url);
          const markdown = composeMarkdown(frontMatter, markdownBody);
          const fileName = getFileName(meta);
          const success = {
            url,
            ok: true,
            fileName,
            markdown,
            meta,
          };
          results[currentIndex] = success;
          successes.push(success);
        } catch (error) {
          results[currentIndex] = {
            url,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }

    const workers = [];
    const limit = Math.min(CONCURRENCY, input.urls.length);
    for (let i = 0; i < limit; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (successes.length === 0) {
      return { results };
    }

    const zip = await buildZip(successes);
    return { results, zip };
  }

  async function fetchWithRetry(url, maxRetries = 2, backoffBaseMs = 750) {
    const attempt = async (retry) => {
      try {
        const response = await fetch(url, {
          headers: DEFAULT_HEADERS,
          redirect: 'follow',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
          throw new Error(`Unsupported content-type: ${contentType}`);
        }

        return await response.text();
      } catch (error) {
        if (retry >= maxRetries) {
          throw error;
        }
        const waitMs = backoffBaseMs * 2 ** retry;
        await delay(waitMs);
        return attempt(retry + 1);
      }
    };

    return attempt(0);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function sanitizeAuthor(value) {
    if (!value) return undefined;
    return value
      .split(/,|;/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join(', ');
  }

  function toAbsoluteUrl(base, candidate) {
    if (!candidate) return undefined;
    try {
      return new URL(candidate, base).toString();
    } catch (_error) {
      return undefined;
    }
  }

  async function extractArticle(url, html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    if (!doc) {
      throw new Error('Failed to parse HTML.');
    }
    ensureDocumentMetadata(doc, url);
    const reader = new Readability(doc);
    const article = reader.parse();

    const canonical =
      doc.querySelector("link[rel='canonical']")?.getAttribute('href') ||
      undefined;
    const ogTitle =
      doc.querySelector("meta[property='og:title']")?.getAttribute('content') ||
      undefined;
    const ogSite =
      doc
        .querySelector("meta[property='og:site_name']")
        ?.getAttribute('content') || undefined;
    const ogDescription =
      doc
        .querySelector("meta[property='og:description']")
        ?.getAttribute('content') || undefined;
    const ogImage =
      doc.querySelector("meta[property='og:image']")?.getAttribute('content') ||
      undefined;
    const twitterImage =
      doc.querySelector("meta[name='twitter:image']")?.getAttribute('content') ||
      undefined;
    const metaAuthor =
      doc.querySelector("meta[name='author']")?.getAttribute('content') ||
      undefined;
    const articlePublished =
      doc
        .querySelector("meta[property='article:published_time']")
        ?.getAttribute('content') ||
      doc.querySelector("meta[name='date']")?.getAttribute('content') ||
      undefined;

    const title =
      (article && article.title) ||
      ogTitle ||
      doc.title ||
      new URL(url).hostname;
    const textContent =
      (article && article.textContent) || doc.body?.textContent || '';

    const wordCount = textContent
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean).length;
    const readingMinutes = wordCount
      ? Math.max(1, Math.round(wordCount / 200))
      : undefined;
    const fetchedAt = new Date().toISOString();
    const image = toAbsoluteUrl(url, ogImage || twitterImage);
    const lang = doc.documentElement.lang || undefined;
    const description =
      (article && article.excerpt) ||
      ogDescription ||
      doc
        .querySelector("meta[name='description']")
        ?.getAttribute('content') ||
      undefined;
    const author = sanitizeAuthor(
      (article && article.byline) || metaAuthor || undefined,
    );
    const domain = new URL(url).hostname;
    const articleHtml =
      (article && article.content) ||
      `<article>${doc.body ? doc.body.innerHTML : ''}</article>`;
    const canonicalUrl = toAbsoluteUrl(
      url,
      canonical || (article && article.url) || undefined,
    );
    const contentHash = await sha256Hex(articleHtml);

    const meta = {
      title,
      siteName: (article && article.siteName) || ogSite || undefined,
      description,
      author,
      published: articlePublished || undefined,
      fetchedAt,
      canonical: canonicalUrl || url,
      domain,
      lang,
      image,
      wordCount,
      readingMinutes,
      contentHash,
    };

    return { articleHtml, meta };
  }

  function ensureDocumentMetadata(doc, url) {
    if (!doc.head) {
      const head = doc.createElement('head');
      doc.insertBefore(head, doc.body);
    }
    const hasBase = doc.querySelector('base');
    if (!hasBase) {
      const base = doc.createElement('base');
      base.href = url;
      doc.head.prepend(base);
    }
    tryDefine(doc, 'baseURI', { value: url });
    tryDefine(doc, 'documentURI', { value: url });
    if (!doc.location) {
      try {
        doc.location = { href: url };
      } catch (_error) {
        // noop
      }
    }
  }

  function tryDefine(target, key, descriptor) {
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        writable: false,
        ...descriptor,
      });
    } catch (_error) {
      // noop
    }
  }

  async function sha256Hex(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function htmlToMarkdown(html) {
    return turndownService.turndown(html);
  }

  function toIsoDateOnly(dateLike) {
    if (!dateLike) return undefined;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return undefined;
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function renderAuthorYaml(author) {
    if (!author) return 'author:';
    const list = Array.isArray(author) ? author : [author];
    if (list.length === 0) return 'author:';
    const lines = ['author:', ...list.map((a) => `  - ${JSON.stringify(a)}`)];
    return lines.join('\n');
  }

  function buildFrontMatter(meta, tags, sourceUrl) {
    const title = `title: ${JSON.stringify(meta.title || '')}`;
    const source = `source: ${JSON.stringify(
      sourceUrl || meta.canonical || meta.domain,
    )}`;
    const authorBlock = renderAuthorYaml(meta.author);
    const published = `published: ${
      meta.published ? JSON.stringify(meta.published) : ''
    }`;
    const createdDate = toIsoDateOnly(meta.fetchedAt) || '';
    const created = `created: ${createdDate}`;
    const description = `description: ${JSON.stringify(
      meta.description || '',
    )}`;
    const tagsLine = `tags: [${(tags || [])
      .map((t) => JSON.stringify(t))
      .join(', ')}]`;
    const image = `image: ${meta.image ? JSON.stringify(meta.image) : ''}`;

    const lines = [
      title,
      source,
      authorBlock,
      published,
      created,
      description,
      tagsLine,
      image,
    ];

    return `---\n${lines.join('\n')}\n---`;
  }

  function composeMarkdown(frontMatter, markdown) {
    return `${frontMatter}\n\n${markdown}`.trim() + '\n';
  }

  function sanitizeTitleForFilename(title) {
    const withoutReserved = title
      .replace(/[\\/?%*:"|<>]/g, ' ')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim();
    const collapsed = withoutReserved.replace(/\s+/g, ' ').trim();
    const limited = collapsed.slice(0, 120).trim();
    return limited.replace(/[\s.]+$/g, '');
  }

  function getFileName(meta) {
    const title = meta.title && meta.title.trim();
    const base =
      title && title.length > 0
        ? sanitizeTitleForFilename(title)
        : meta.domain.replace(/\./g, '-');
    return `${base}.md`;
  }

  async function buildZip(results) {
    const zip = new JSZip();
    const titleRegex =
      /^---[\s\S]*?\ntitle:\s*("([^"]*)"|'([^']*)'|(.+?))\n[\s\S]*?---/;

    results.forEach((result) => {
      const match = result.markdown.match(titleRegex);
      let fileBase = result.fileName.replace(/\.md$/i, '');
      if (match) {
        const captured = match[2] || match[3] || match[4] || '';
        const titleText = (captured || '').toString().trim();
        if (titleText.length > 0) {
          fileBase = sanitizeTitleForFilename(titleText);
        }
      }
      const finalName = `${fileBase}.md`;
      zip.file(finalName, result.markdown);
    });

    return zip.generateAsync({ type: 'uint8array' });
  }
})();
