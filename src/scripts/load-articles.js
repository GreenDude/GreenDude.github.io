// load-articles.js
function isV2Article(obj) {
  return obj && (obj['@type'] === 'Article' || obj.headline || obj.datePublished);
}

function firstImage(imageField) {
  // image can be a string, an array of strings/objects, or an object
  if (!imageField) return undefined;
  if (typeof imageField === 'string') return imageField;

  if (Array.isArray(imageField)) {
    for (const item of imageField) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        if (item.url) return item.url;
        if (item.contentUrl) return item.contentUrl;
      }
    }
    return undefined;
  }

  // object form
  if (typeof imageField === 'object') {
    return imageField.url || imageField.contentUrl;
  }
  return undefined;
}

function resolveLink(v2) {
  // Prefer the canonical page URL if present
  const fromMainEntity = v2?.mainEntityOfPage;
  if (fromMainEntity) {
    if (typeof fromMainEntity === 'string') return fromMainEntity;
    if (typeof fromMainEntity === 'object' && fromMainEntity['@id']) return fromMainEntity['@id'];
  }
  // Common fallbacks
  return v2.url || v2.mainEntityUrl || v2.canonicalUrl || undefined;
}

function normalizeArticle(entry) {
  if (!isV2Article(entry)) {
    // Assume V1 shape already
    return {
      title: entry.title,
      summary: entry.summary,
      thumbnail: entry.thumbnail,
      date: entry.date,
      link: entry.link,
      section: entry.section || entry.articleSection
    };
  }

  // V2 → V1 mapping
  return {
    title: entry.headline || entry.name,
    summary: entry.description || '',
    thumbnail: firstImage(entry.image),
    date: entry.datePublished || entry.dateModified || entry.date || '',
    link: resolveLink(entry),
    section: entry.articleSection
  };
}

async function loadArticles(metadataPath, metadataFile, containerSelector) {
  try {
    const res = await fetch(metadataPath + metadataFile);
    const raw = await res.json();

    // raw is expected to be an array in both V1 and V2
    const articles = (Array.isArray(raw) ? raw : []).map(normalizeArticle);

    // Newest first (supports ISO or yyyy-mm-dd)
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    const container = document.querySelector(containerSelector);
    if (!container) return;

    articles.forEach(article => {
      const dateLabel = article.date ? new Date(article.date).toLocaleDateString() : '';
      const thumb = article.thumbnail || '';
      const title = article.title || 'Untitled';
      const summary = article.summary || '';
      const link = article.link || '#';

      const card = document.createElement('div');
      card.className = 'article-card';
      card.innerHTML = `
        <img src="${thumb}" alt="${title}">
        <div class="article-content">
          <p class="section-label">${dateLabel}</p>
          <h2 class="article-title">${title}</h2>
          <p class="latest-story-text">${summary}</p>
          <a href="${link}" class="read-latest-article">READ NOW</a>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("Error loading articles:", metadataPath, metadataFile, err);
  }
}