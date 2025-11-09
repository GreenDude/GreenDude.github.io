// load-latest-article.js
const CATEGORY_PATHS = [
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
      console.log(`Fetching: ${path}`);
      const res = await fetch(path);
      if (!res.ok) {
        console.warn(`Failed to fetch ${path}`);
        continue;
      }
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : [];
      allArticles.push(...arr.map(normalizeArticle));
    }

    allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = allArticles[0];
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