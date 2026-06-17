// load-latest-article.js
const CATEGORY_PATHS = [
  './articles/ai/',
  './articles/dev/metadata.json',
  './articles/project-management/metadata.json',
  './articles/philosophy/metadata.json',
  './articles/psychology/metadata.json'
];

function isV2Article(obj) {
  return obj && (obj['@type'] === 'Article' || obj.headline || obj.datePublished);
}

function firstImage(imageField) {
  if (!imageField) return undefined;
  if (typeof imageField === 'string') return imageField;
  if (Array.isArray(imageField)) {
    for (const item of imageField) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.url || item.contentUrl;
    }
    return undefined;
  }
  if (typeof imageField === 'object') return imageField.url || imageField.contentUrl;
  return undefined;
}

function resolveLink(v2) {
  const me = v2?.mainEntityOfPage;
  if (me) {
    if (typeof me === 'string') return me;
    if (typeof me === 'object' && me['@id']) return me['@id'];
  }
  return v2.url || v2.mainEntityUrl || v2.canonicalUrl || undefined;
}

function normalizeArticle(entry) {
  if (!isV2Article(entry)) {
    return {
      title: entry.title,
      summary: entry.summary,
      thumbnail: entry.thumbnail,
      date: entry.date,
      link: entry.link
    };
  }
  return {
    title: entry.headline || entry.name,
    summary: entry.description || '',
    thumbnail: firstImage(entry.image),
    date: entry.datePublished || entry.dateModified || entry.date || '',
    link: resolveLink(entry)
  };
}

async function loadLatestArticle() {
  try {
    const allArticles = [];

    for (const path of CATEGORY_PATHS) {
      const feedFiles = path.endsWith('.json')
        ? [path, path.replace('metadata.json', 'generated-metadata.json')]
        : [`${path}metadata.json`, `${path}generated-metadata.json`];

      for (const feedPath of feedFiles) {
        console.log(`Fetching: ${feedPath}`);
        const res = await fetch(feedPath);
        if (!res.ok) {
          continue;
        }
        const raw = await res.json();
        const arr = Array.isArray(raw) ? raw : [];
        allArticles.push(...arr.map(normalizeArticle));
      }
    }

    const uniqueArticles = [];
    const seen = new Set();
    for (const article of allArticles) {
      const key = article.link || `${article.title}|${article.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueArticles.push(article);
    }

    uniqueArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = uniqueArticles[0];
    console.log('Latest article:', latest);
    if (!latest) return;

    const container = document.getElementById('latest-article');
    const dateLabel = latest.date ? new Date(latest.date).toLocaleDateString() : 'LATEST ARTICLE';
    container.innerHTML = `
      <img src="${latest.thumbnail || ''}" alt="${latest.title || 'Latest Article'}">
      <div class="article-content">
        <p class="section-label">LATEST ARTICLE • ${dateLabel}</p>
        <h2 class="article-title">${latest.title || 'Untitled'}</h2>
        <p class="latest-story-text">${latest.summary || ''}</p>
        <a href="${latest.link || '#'}" class="read-latest-article">READ NOW</a>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load latest article:', err);
  }
}

document.addEventListener('DOMContentLoaded', loadLatestArticle);
