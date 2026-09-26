#!/usr/bin/env python3
"""Live-app Dialog PDF in the v7 Tier 1-4 reportlab chrome."""
import json
import sys
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    CondPageBreak,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def esc(value):
    return ("" if value is None else str(value)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def latin(value):
    text = "" if value is None else str(value)
    text = (
        text.replace("\f", " ")
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u02bb", "'")
        .replace("\u02bc", "'")
        .replace("\u2026", "...")
    )
    return esc(text)


def tbl(rows, col_widths):
    safe = [[latin(cell) for cell in row] for row in rows]
    table = Table(safe, colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef7")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.grey),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def build(pack):
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontSize=16, spaceAfter=8, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading1"], fontSize=12, spaceBefore=10, spaceAfter=6))
    styles.add(ParagraphStyle(name="SubSec", parent=styles["Heading2"], fontSize=10, spaceBefore=8, spaceAfter=4))
    styles.add(ParagraphStyle(name="Body", parent=styles["Normal"], fontSize=8.5, leading=11))
    styles.add(ParagraphStyle(name="TurnApp", parent=styles["Normal"], fontSize=8.5, leading=10.5, textColor=colors.HexColor("#0b3d91"), spaceBefore=5))
    styles.add(ParagraphStyle(name="TurnCust", parent=styles["Normal"], fontSize=8.5, leading=10.5, textColor=colors.HexColor("#1a1a1a"), spaceBefore=5))
    styles.add(ParagraphStyle(name="Qual", parent=styles["Normal"], fontSize=7.2, leading=9, textColor=colors.HexColor("#336633"), leftIndent=10))
    styles.add(ParagraphStyle(name="Tim", parent=styles["Normal"], fontSize=7.2, leading=9, textColor=colors.HexColor("#555555"), leftIndent=10))
    styles.add(ParagraphStyle(name="Meta", parent=styles["Normal"], fontSize=7.5, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="Headline", parent=styles["Normal"], fontSize=9.5, leading=12, textColor=colors.HexColor("#0b3d91"), spaceBefore=4, spaceAfter=4))

    story = []
    story.append(Paragraph(latin(pack.get("title")), styles["CoverTitle"]))
    story.append(Paragraph(latin(f"pack_id: {pack.get('pack_id')}"), styles["Meta"]))
    story.append(Paragraph(latin(pack.get("turns_line")), styles["Meta"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("QUALITY COMPARISON vs v6 gpt-5-mini", styles["Section"]))
    story.append(Paragraph(f"<b>Headline:</b> {latin(pack.get('headline'))}", styles["Headline"]))
    story.append(tbl(pack.get("quality_rows") or [], [1.7 * inch, 2.4 * inch, 2.6 * inch]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Per-tier mean overall (v7)", styles["SubSec"]))
    story.append(tbl(pack.get("tier_rows") or [], [0.6 * inch, 3.2 * inch, 1.4 * inch]))
    story.append(Paragraph("TIMINGS vs v6 gpt-5-mini", styles["Section"]))
    story.append(tbl(pack.get("timing_rows") or [], [0.85 * inch, 2.15 * inch, 0.4 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch]))
    story.append(Paragraph(latin(pack.get("speedup")), styles["Body"]))
    story.append(Paragraph("Hard recipe", styles["Section"]))
    for key, value in pack.get("recipe") or []:
        story.append(Paragraph(f"<b>{latin(key)}</b>: {latin(value)}", styles["Body"]))
    story.append(Paragraph("Roster", styles["Section"]))
    for line in pack.get("roster") or []:
        story.append(Paragraph(latin(line), styles["Body"]))
    story.append(Paragraph("Priority beats covered", styles["SubSec"]))
    story.append(Paragraph(latin(pack.get("beats") or "(none stored)"), styles["Body"]))
    story.append(Paragraph("Dialog judge rollup", styles["Section"]))
    story.append(Paragraph(latin(pack.get("judge")), styles["Body"]))
    story.append(PageBreak())
    story.append(Paragraph("Full interleaved transcript (quality + timing under each app turn)", styles["Section"]))
    story.append(Paragraph("Mark in-app corrections here. Each APP turn shows model + tier.", styles["Meta"]))
    for turn in pack.get("turns") or []:
        style = styles["TurnApp"] if turn.get("app") else styles["TurnCust"]
        block = [Paragraph(
            f"<b>{latin(turn.get('label'))}</b> <font size='6.5' color='#666'>[{latin(turn.get('meta'))}]</font><br/>{latin(turn.get('text'))}",
            style,
        )]
        if turn.get("quality"):
            block.append(Paragraph(latin(turn.get("quality")), styles["Qual"]))
        if turn.get("timing"):
            block.append(Paragraph(latin(turn.get("timing")), styles["Tim"]))
        story.append(CondPageBreak(1.6 * inch))
        for flowable in block:
            story.append(flowable)
    story.append(PageBreak())
    story.append(Paragraph("Beat index", styles["Section"]))
    story.append(Paragraph(latin(pack.get("beats") or "(none stored)"), styles["Body"]))
    story.append(Paragraph("Correction notes (blank)", styles["Section"]))
    for _ in range(4):
        story.append(Paragraph("_" * 90, styles["Meta"]))

    footer = str(pack.get("footer_id") or pack.get("pack_id") or "")

    def paint(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(0.7 * inch, 0.4 * inch, footer[:80])
        canvas.drawRightString(letter[0] - 0.7 * inch, 0.4 * inch, f"page {doc_.page}")
        canvas.restoreState()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.85 * inch,
        pageCompression=0,
    )
    doc.build(story, onFirstPage=paint, onLaterPages=paint)
    return buffer.getvalue()


def main():
    pack = json.load(sys.stdin)
    sys.stdout.buffer.write(build(pack))


if __name__ == "__main__":
    main()
