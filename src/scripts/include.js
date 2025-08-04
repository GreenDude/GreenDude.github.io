async function includeHTML() {
    const includeElements = document.querySelectorAll('[data-include]');

    for (const el of includeElements) {
        const file = el.getAttribute('data-include');
        try {
            const res = await fetch(file);
            if (!res.ok) throw new Error(`Failed to load ${file}`);
            const html = await res.text();
            el.innerHTML = html;
        } catch (err) {
            console.error(err);
            el.innerHTML = `<div style="color:red;">${err.message}</div>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', includeHTML);
