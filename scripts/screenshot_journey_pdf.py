#!/usr/bin/env python3
"""Screenshot Journey PDF. Reads a manifest and overwrites the output PDF."""
import json
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer


def esc(value):
    return ("" if value is None else str(value)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build(manifest, dest):
    pages = list(manifest.get("pages") or [])
    gaps = list(manifest.get("gaps") or [])
    styles = {
        "h1": ParagraphStyle("h1", fontName="Times-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#1a1a1a"), spaceAfter=8),
        "void": ParagraphStyle("void", fontName="Times-Bold", fontSize=18, leading=22, textColor=colors.HexColor("#8c1d1d"), spaceAfter=6),
        "h2": ParagraphStyle("h2", fontName="Times-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#1a1a1a"), spaceBefore=8, spaceAfter=4),
        "body": ParagraphStyle("body", fontName="Times-Roman", fontSize=10, leading=13, alignment=TA_LEFT),
        "gap": ParagraphStyle("gap", fontName="Times-Roman", fontSize=10, leading=13, textColor=colors.HexColor("#6b2d2d")),
        "exempt": ParagraphStyle("exempt", fontName="Times-Roman", fontSize=10, leading=13, textColor=colors.HexColor("#3d4a32")),
        "cap": ParagraphStyle("cap", fontName="Times-Bold", fontSize=11, leading=14, spaceAfter=2),
        "note": ParagraphStyle("note", fontName="Times-Italic", fontSize=9, leading=12, textColor=colors.HexColor("#333333"), spaceAfter=6),
    }
    story = []
    banner = str(manifest.get("deployBanner") or "").strip()
    if manifest.get("void") or banner.startswith("VOID"):
        story.append(Paragraph("VOID", styles["void"]))
    if banner:
        story.append(Paragraph(esc(banner), styles["body"]))
        story.append(Spacer(1, 8))
    story.append(Paragraph(esc(manifest.get("title") or "Screenshot Journey"), styles["h1"]))
    story.append(Paragraph(esc(manifest.get("subtitle") or "Real app screens. The deleted card shell is not included."), styles["body"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Contents", styles["h2"]))
    story.append(Paragraph("Gaps are surfaces with no screenshot. They are not silent skips.", styles["body"]))
    story.append(Spacer(1, 6))
    open_gaps = [gap for gap in gaps if not gap.get("exempt")]
    exempted = [gap for gap in gaps if gap.get("exempt")]
    story.append(Paragraph("Not captured", styles["h2"]))
    if not open_gaps:
        story.append(Paragraph("None.", styles["body"]))
    for gap in open_gaps:
        feature = esc(gap.get("feature") or gap.get("title") or "Surface")
        filename = esc(gap.get("file") or "")
        reason = esc(gap.get("reason") or "not captured")
        file_bit = f" ({filename})" if filename else ""
        story.append(Paragraph(f"GAP. {feature}{file_bit}: {reason}", styles["gap"]))
    if exempted:
        story.append(Paragraph("Exempt", styles["h2"]))
        for gap in exempted:
            feature = esc(gap.get("feature") or gap.get("title") or "Surface")
            filename = esc(gap.get("file") or "")
            reason = esc(gap.get("reason") or "not captured")
            file_bit = f" ({filename})" if filename else ""
            story.append(Paragraph(f"EXEMPT. {feature}{file_bit}: {reason}", styles["exempt"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Pages", styles["h2"]))
    if not pages:
        story.append(Paragraph("No screenshots were captured.", styles["body"]))
    for index, page in enumerate(pages, start=1):
        chapter = esc(page.get("chapter") or "")
        title = esc(page.get("title") or page.get("id") or "Screen")
        filename = esc(page.get("file") or "")
        file_bit = f" — {filename}" if filename else ""
        story.append(Paragraph(f"{index}. {chapter}: {title}{file_bit}", styles["body"]))
    for page in pages:
        story.append(PageBreak())
        chapter = esc(page.get("chapter") or "")
        title = esc(page.get("title") or "")
        filename = esc(page.get("file") or "")
        note = esc(page.get("note") or "")
        story.append(Paragraph(f"{chapter}: {title}", styles["cap"]))
        if filename:
            story.append(Paragraph(filename, styles["note"]))
        if note:
            story.append(Paragraph(note, styles["note"]))
        image_path = page.get("image") or ""
        reader = ImageReader(image_path)
        width, height = reader.getSize()
        max_w, max_h = 7.2 * inch, 8.1 * inch
        scale = min(max_w / float(width), max_h / float(height))
        story.append(Image(image_path, width * scale, height * scale))
    doc = SimpleDocTemplate(
        dest,
        pagesize=letter,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.5 * inch,
        title=str(manifest.get("title") or "Screenshot Journey"),
    )
    doc.build(story)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: screenshot_journey_pdf.py <manifest.json> <out.pdf>")
    with open(sys.argv[1], "r", encoding="utf8") as handle:
        manifest = json.load(handle)
    build(manifest, sys.argv[2])


if __name__ == "__main__":
    main()
