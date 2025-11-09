function shareOnLinkedIn() {
  // Explicit LinkedIn "intent" share URL
  const url = encodeURIComponent(window.location.href);
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
  window.open(linkedInUrl, '_blank', 'noopener,noreferrer');
}

function copyArticleLink() {
  const currentUrl = window.location.href;
  navigator.clipboard.writeText(currentUrl)
    .then(() => {
      const status = document.getElementById('copy-status');
      if (status) {
        status.hidden = false;
        status.textContent = "Copied!";
        // hide after 2s
        setTimeout(() => { status.hidden = true; }, 2000);
      }
    })
    .catch(() => {
      alert("Failed to copy link");
    });
}

// Auto-fix LinkedIn <script type="IN/Share"> embed
document.addEventListener("DOMContentLoaded", function () {
  // Find any LinkedIn share widgets on page
  const linkedInWidgets = document.querySelectorAll('script[type="IN/Share"]');

  linkedInWidgets.forEach(widget => {
    // If you forgot to set data-url in the HTML, patch it to current page URL
    if (!widget.getAttribute('data-url') || widget.getAttribute('data-url').trim() === "") {
      widget.setAttribute('data-url', window.location.href);
    }
  });

  // If LinkedIn API loaded, re-parse to render their official button(s)
  if (typeof IN !== 'undefined' && IN.parse) {
    IN.parse();
  }
});