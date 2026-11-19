#!/usr/bin/env python3
import json
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate


def esc(value):
    return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build(pages, dest):
    if not pages:
        raise SystemExit("refused: customer pdf has no pages")
    style = ParagraphStyle("cap", fontName="Times-Bold", fontSize=11, leading=14, spaceAfter=6)
    story = []
    for index, page in enumerate(pages):
        image = page.get("image") or ""
        if not image:
            raise SystemExit("refused: customer pdf page has no image")
        story.append(Paragraph(esc(page.get("label") or ""), style))
        reader = ImageReader(image)
        width, height = reader.getSize()
        scale = min((7.2 * inch) / float(width), (8.4 * inch) / float(height))
        story.append(Image(image, width * scale, height * scale))
        if index != len(pages) - 1:
            story.append(PageBreak())
    doc = SimpleDocTemplate(
        dest,
        pagesize=letter,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.4 * inch,
        title="Customer",
    )
    doc.build(story)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: onboarding_customer_pdf.py <pages.json> <out.pdf>")
    with open(sys.argv[1], "r", encoding="utf8") as handle:
        pages = json.load(handle)
    build(pages, sys.argv[2])


if __name__ == "__main__":
    main()
