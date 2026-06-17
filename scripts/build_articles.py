#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import html
import json
import re
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
ARTICLES_DIR = ROOT / "articles"
SITE_URL = "https://www.cloud-raccoon.com"
NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
}

META_KEYS = {"title", "summary", "date", "slug", "tags", "hero", "description"}


@dataclass
class ArticleDoc:
    title: str
    slug: str
    summary: str
    description: str
    published_iso: str
    section: str
    blocks: list[str]
    hero_image: str
    keywords: list[str]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "article"


def read_xml(archive: zipfile.ZipFile, name: str) -> ET.Element:
    with archive.open(name) as handle:
        return ET.fromstring(handle.read())


def extract_text(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.findall(".//w:t", NS)).strip()


def get_relationships(archive: zipfile.ZipFile) -> dict[str, str]:
    try:
        root = read_xml(archive, "word/_rels/document.xml.rels")
    except KeyError:
        return {}

    relationships: dict[str, str] = {}
    for rel in root:
        rel_id = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        if rel_id and target:
            relationships[rel_id] = target
    return relationships


def get_core_properties(archive: zipfile.ZipFile) -> dict[str, str]:
    try:
        root = read_xml(archive, "docProps/core.xml")
    except KeyError:
        return {}

    values: dict[str, str] = {}
    mapping = {
        "title": "dc:title",
        "description": "dc:description",
        "keywords": "cp:keywords",
        "created": "dcterms:created",
        "modified": "dcterms:modified",
    }
    for key, xpath in mapping.items():
        node = root.find(xpath, NS)
        if node is not None and node.text:
            values[key] = node.text.strip()
    return values


def paragraph_style(paragraph: ET.Element) -> str:
    node = paragraph.find("./w:pPr/w:pStyle", NS)
    if node is None:
        return ""
    return node.attrib.get(f"{{{NS['w']}}}val", "")


def parse_metadata(lines: list[str]) -> tuple[dict[str, str], int]:
    metadata: dict[str, str] = {}
    consumed = 0

    for line in lines:
        text = line.strip()
        if not text:
            consumed += 1
            if metadata:
                break
            continue

        match = re.match(r"^([A-Za-z]+)\s*:\s*(.+)$", text)
        if not match:
            break

        key = match.group(1).lower()
        value = match.group(2).strip()
        if key not in META_KEYS:
            break

        metadata[key] = value
        consumed += 1

    return metadata, consumed


def format_section_name(folder_name: str) -> str:
    special_cases = {"ai": "AI"}
    return special_cases.get(folder_name, folder_name.replace("-", " ").title())


def render_runs(paragraph: ET.Element, relationships: dict[str, str]) -> str:
    parts: list[str] = []

    for child in paragraph:
        tag = child.tag.rsplit("}", 1)[-1]

        if tag == "r":
            text = "".join(node.text or "" for node in child.findall(".//w:t", NS))
            if text:
                escaped = html.escape(text, quote=True)
                props = child.find("./w:rPr", NS)
                if props is not None:
                    if props.find("./w:b", NS) is not None:
                        escaped = f"<strong>{escaped}</strong>"
                    if props.find("./w:i", NS) is not None:
                        escaped = f"<em>{escaped}</em>"
                parts.append(escaped)

            for blip in child.findall(".//a:blip", NS):
                rel_id = blip.attrib.get(f"{{{NS['r']}}}embed")
                target = relationships.get(rel_id or "")
                if target:
                    parts.append(f"[[image:{target}]]")

        elif tag == "hyperlink":
            text = extract_text(child)
            rel_id = child.attrib.get(f"{{{NS['r']}}}id")
            href = relationships.get(rel_id or "", "#")
            parts.append(f'<a href="{html.escape(href, quote=True)}">{html.escape(text, quote=True)}</a>')

    return "".join(parts).strip()


def list_info(paragraph: ET.Element) -> bool:
    return paragraph.find("./w:pPr/w:numPr", NS) is not None


def collect_image_targets(paragraphs: Iterable[ET.Element], relationships: dict[str, str]) -> list[str]:
    targets: list[str] = []
    for paragraph in paragraphs:
        for blip in paragraph.findall(".//a:blip", NS):
            rel_id = blip.attrib.get(f"{{{NS['r']}}}embed")
            target = relationships.get(rel_id or "")
            if target and target not in targets:
                targets.append(target)
    return targets


def write_images(archive: zipfile.ZipFile, category_dir: Path, slug: str, targets: Iterable[str]) -> dict[str, str]:
    output_dir = category_dir / "generated" / slug
    output_dir.mkdir(parents=True, exist_ok=True)

    image_map: dict[str, str] = {}
    for index, target in enumerate(targets, start=1):
        archive_path = f"word/{target}" if not target.startswith("word/") else target
        suffix = Path(target).suffix.lower() or ".png"
        output_name = f"image-{index}{suffix}"
        output_path = output_dir / output_name

        with archive.open(archive_path) as source, output_path.open("wb") as destination:
            shutil.copyfileobj(source, destination)

        image_map[target] = f"/articles/{category_dir.name}/generated/{slug}/{output_name}"

    return image_map


def parse_date(raw: str, docx_path: Path) -> str:
    candidates = [raw] if raw else []
    candidates.append(dt.datetime.fromtimestamp(docx_path.stat().st_mtime, dt.timezone.utc).isoformat())

    for candidate in candidates:
        if not candidate:
            continue
        normalized = candidate.replace("Z", "+00:00")
        try:
            parsed = dt.datetime.fromisoformat(normalized)
        except ValueError:
            try:
                parsed = dt.datetime.strptime(candidate, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
            except ValueError:
                continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.isoformat()

    return dt.datetime.now(dt.timezone.utc).isoformat()


def parse_docx(docx_path: Path, category_dir: Path) -> ArticleDoc:
    with zipfile.ZipFile(docx_path) as archive:
        document = read_xml(archive, "word/document.xml")
        relationships = get_relationships(archive)
        core = get_core_properties(archive)
        paragraphs = document.findall(".//w:body/w:p", NS)
        plain_lines = [extract_text(paragraph) for paragraph in paragraphs]
        metadata, consumed = parse_metadata(plain_lines)

        title = metadata.get("title") or core.get("title") or docx_path.stem
        slug = slugify(metadata.get("slug") or title)
        description = metadata.get("description") or core.get("description") or title
        summary = metadata.get("summary") or description
        published_iso = parse_date(metadata.get("date", "") or core.get("created", "") or core.get("modified", ""), docx_path)
        section = format_section_name(category_dir.name)
        keywords = [item.strip() for item in (metadata.get("tags") or core.get("keywords") or "").split(",") if item.strip()]

        body_paragraphs = paragraphs[consumed:]
        image_targets = collect_image_targets(body_paragraphs, relationships)
        image_map = write_images(archive, category_dir, slug, image_targets) if image_targets else {}
        hero_image = image_map.get(metadata.get("hero", "").strip(), "") if metadata.get("hero") else ""
        if not hero_image and image_map:
            hero_image = next(iter(image_map.values()))

        blocks: list[str] = []
        pending_list: list[str] = []
        skipped_title = False

        for paragraph in body_paragraphs:
            text = extract_text(paragraph)
            rich = render_runs(paragraph, relationships)
            style = paragraph_style(paragraph).lower()

            if not text and not rich:
                continue

            if not skipped_title and text == title:
                skipped_title = True
                continue

            if style.startswith("heading"):
                if pending_list:
                    blocks.append(f"<ul>{''.join(pending_list)}</ul>")
                    pending_list = []
                level_match = re.search(r"(\d+)", style)
                level = level_match.group(1) if level_match else "2"
                blocks.append(f"<h{level}>{rich or html.escape(text, quote=True)}</h{level}>")
                continue

            if list_info(paragraph):
                pending_list.append(f"<li>{rich or html.escape(text, quote=True)}</li>")
                continue

            if pending_list:
                blocks.append(f"<ul>{''.join(pending_list)}</ul>")
                pending_list = []

            content = rich or html.escape(text, quote=True)
            for source, public_path in image_map.items():
                content = content.replace(f"[[image:{source}]]", f'<img class="generated-article__inline-image" src="{public_path}" alt="{html.escape(title, quote=True)}" />')

            blocks.append(f"<p>{content}</p>")

        if pending_list:
            blocks.append(f"<ul>{''.join(pending_list)}</ul>")

        if not blocks:
            blocks.append(f"<p>{html.escape(summary, quote=True)}</p>")

        return ArticleDoc(
            title=title,
            slug=slug,
            summary=summary,
            description=description,
            published_iso=published_iso,
            section=section,
            blocks=blocks,
            hero_image=hero_image,
            keywords=keywords,
        )


def render_article_html(article: ArticleDoc, category_dir: Path) -> str:
    canonical = f"{SITE_URL}/articles/{category_dir.name}/{article.slug}.html"
    image_url = f"{SITE_URL}{article.hero_image or '/src/img/Logo-light.png'}"
    published_label = dt.datetime.fromisoformat(article.published_iso).strftime("%B %d, %Y")
    body = "\n".join(f"            {block}" for block in article.blocks)
    json_ld = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Article",
            "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
            "headline": article.title,
            "description": article.description,
            "image": image_url,
            "author": {"@type": "Person", "name": "Gheorghii Mosin", "url": SITE_URL},
            "publisher": {
                "@type": "Organization",
                "name": "Cloud Raccoon",
                "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/src/img/Logo-dark.png"},
            },
            "datePublished": article.published_iso,
            "dateModified": article.published_iso,
            "articleSection": article.section,
            "keywords": article.keywords,
        },
        ensure_ascii=True,
        indent=2,
    )

    tags = "\n".join(f'    <meta property="article:tag" content="{html.escape(tag, quote=True)}" />' for tag in article.keywords)
    hero = f'            <img class="generated-article__cover" src="{article.hero_image}" alt="{html.escape(article.title, quote=True)}" />' if article.hero_image else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{html.escape(article.title, quote=True)} - Cloud Raccoon</title>
    <meta name="description" content="{html.escape(article.description, quote=True)}" />
    <link rel="canonical" href="{canonical}" />
    <link rel="icon" type="image/png" href="/src/img/Logo-dark.png" />
    <link rel="stylesheet" href="/styles.css?v=4" />
    <link rel="stylesheet" href="/src/styles/generated-article.css?v=1" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Cloud Raccoon" />
    <meta property="og:title" content="{html.escape(article.title, quote=True)}" />
    <meta property="og:description" content="{html.escape(article.description, quote=True)}" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:image" content="{image_url}" />
    <meta property="article:published_time" content="{article.published_iso}" />
    <meta property="article:section" content="{html.escape(article.section, quote=True)}" />
{tags}
    <script type="application/ld+json">
{json_ld}
    </script>
    <script src="/src/scripts/include.js" defer></script>
    <script src="/src/scripts/share.js" defer></script>
</head>
<body>
    <div data-include="/src/frames/navbar.html"></div>
    <main class="generated-article">
        <header class="generated-article__hero">
            <p class="generated-article__eyebrow">{html.escape(article.section, quote=True)}</p>
            <h1>{html.escape(article.title, quote=True)}</h1>
            <p class="generated-article__summary">{html.escape(article.summary, quote=True)}</p>
            <div class="generated-article__meta">
                <span>Published on {published_label}</span>
                <button type="button" class="generated-article__share" onclick="copyArticleLink()">Copy article link</button>
                <span id="copy-status" hidden></span>
            </div>
{hero}
        </header>
        <article class="generated-article__content">
{body}
        </article>
    </main>
</body>
</html>
"""


def render_metadata(article: ArticleDoc, category_dir: Path) -> dict[str, object]:
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"/articles/{category_dir.name}/{article.slug}.html"},
        "headline": article.title,
        "description": article.description,
        "image": article.hero_image or "/src/img/Logo-light.png",
        "datePublished": article.published_iso,
        "dateModified": article.published_iso,
        "articleSection": article.section,
        "keywords": article.keywords,
    }


def build_category(category_dir: Path) -> None:
    generated_entries: list[dict[str, object]] = []

    for docx_path in sorted(category_dir.glob("*.docx")):
        if docx_path.name.startswith("~$"):
            continue

        article = parse_docx(docx_path, category_dir)
        output_path = category_dir / f"{article.slug}.html"
        output_path.write_text(render_article_html(article, category_dir), encoding="utf-8")
        generated_entries.append(render_metadata(article, category_dir))

    metadata_path = category_dir / "generated-metadata.json"
    metadata_path.write_text(json.dumps(generated_entries, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    for category_dir in sorted(path for path in ARTICLES_DIR.iterdir() if path.is_dir()):
        build_category(category_dir)


if __name__ == "__main__":
    main()
