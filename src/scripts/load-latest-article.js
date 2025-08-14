// const CATEGORY_PATHS = [
//   'articles/project-management/metadata.json',
//   'articles/philosophy/metadata.json',
//   'articles/psychology/metadata.json'
// ];

const CATEGORY_PATHS = [
  './articles/project-management/metadata.json',
  './articles/philosophy/metadata.json',
  './articles/psychology/metadata.json'
];

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

      const articles = await res.json();
      console.log(`Fetched ${articles.length} articles from ${path}`);
      allArticles.push(...articles);
    }

    allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = allArticles[0];
    console.log('Latest article:', latest);

    if (!latest) return;

    const container = document.getElementById('latest-article');
    container.innerHTML = `
      <img src="${latest.thumbnail}" alt="${latest.title}">
      <div class="article-content">
        <p class="section-label">LATEST ARTICLE</p>
        <h2 class="article-title">${latest.title}</h2>
        <p class="latest-story-text">${latest.summary}</p>
        <a href="${latest.link}" class="read-latest-article">READ NOW</a>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load latest article:', err);
  }
}


document.addEventListener('DOMContentLoaded', loadLatestArticle);
