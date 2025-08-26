function shareOnLinkedIn() {
  const url = encodeURIComponent(window.location.href);
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
  window.open(linkedInUrl, '_blank');
}

function copyArticleLink() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const status = document.getElementById('copy-status');
    if (status) {
      status.hidden = false;
      status.textContent = "Copied!";
      setTimeout(() => { status.hidden = true; }, 2000);
    }
  }).catch(() => {
    alert("Failed to copy link");
  });
}

document.addEventListener("DOMContentLoaded", function () {
  const linkedInShare = document.querySelector('script[type="IN/Share"]');
  if (linkedInShare && !linkedInShare.getAttribute('data-url')) {
    linkedInShare.setAttribute('data-url', window.location.href);
    if (typeof IN !== 'undefined' && IN.parse) {
      IN.parse();
    }
  }
});