async function loadArticles(metadataPath, metadataFile, containerSelector) {
    try {
        const res = await fetch(metadataPath + metadataFile);
        const articles = await res.json();

        articles.sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

        const container = document.querySelector(containerSelector);
        if (!container) return;

        articles.forEach(article => {
            const card = document.createElement('div');
            card.className = 'article-card';
            card.innerHTML = `
                <img src="${article.thumbnail}" alt="${article.title}">
                <div class="article-content">
                    <p class="section-label">${new Date(article.date).toLocaleDateString()}</p>
                    <h2 class="article-title">${article.title}</h2>
                    <p class="latest-story-text">${article.summary}</p>
                    <a href="${metadataPath + article.link}" class="read-latest-article">READ NOW</a>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading articles:", metadataPath, metadataFile, err);
    }
}
