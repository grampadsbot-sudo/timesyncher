#!/usr/bin/env python3
"""Live-app Dialog PDF in the v7 Tier 1-4 reportlab chrome."""
import json
import re
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


def guard_timing(value):
    """Timing lines may only say jev=. zev= is a typo and is rewritten, then refused if it remains."""
    text = latin(value).replace("zev=", "jev=")
    if "zev" in text.lower():
        raise SystemExit("refused: timing line contains zev")
    if "jev=" not in text:
        raise SystemExit("refused: timing line missing jev=")
    return text


def pdf_literals(data):
    strings = []
    index = 0
    while True:
        start = data.find(b"(", index)
        if start < 0:
            break
        cursor = start + 1
        chars = bytearray()
        while cursor < len(data):
            byte = data[cursor]
            if byte == 0x5C:
                cursor += 1
                if cursor >= len(data):
                    break
                nxt = data[cursor]
                if nxt in b"nrtbf":
                    chars.append({ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}[nxt])
                elif nxt in b"()\\":
                    chars.append(nxt)
                elif 48 <= nxt <= 55:
                    octal = bytearray([nxt])
                    for _ in range(2):
                        if cursor + 1 < len(data) and 48 <= data[cursor + 1] <= 55:
                            cursor += 1
                            octal.append(data[cursor])
                        else:
                            break
                    chars.append(int(bytes(octal), 8) & 0xFF)
                else:
                    chars.append(nxt)
                cursor += 1
                continue
            if byte == 0x29:
                break
            chars.append(byte)
            cursor += 1
        strings.append(bytes(chars))
        index = cursor + 1
    return strings


ITEM34_BAN = re.compile(r"splitting payments|splitting payment|split payment|split-payer", re.I)


def assert_item34(pack):
    blob = "\n".join(str(turn.get("text") or "") for turn in (pack.get("turns") or []))
    if ITEM34_BAN.search(blob):
        raise SystemExit("refused: transcript contains split-payment jargon")


def assert_item34_bytes(pdf_bytes):
    if ITEM34_BAN.search(pdf_bytes.decode("latin1", errors="ignore")):
        raise SystemExit("refused: PDF contains split-payment jargon")


def assert_timing_bytes(pdf_bytes):
    literals = pdf_literals(pdf_bytes)
    timings = [item.decode("latin1") for item in literals if item.startswith(b"timing:")]
    if not timings:
        raise SystemExit("refused: PDF has no timing lines")
    blob = "\n".join(timings)
    if "zev" in blob.lower() or b"zev=" in pdf_bytes:
        raise SystemExit("refused: PDF timing emitted zev")
    if any("jev=" not in line for line in timings):
        raise SystemExit("refused: PDF timing line missing jev=")


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
    assert_item34(pack)
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
            block.append(Paragraph(guard_timing(turn.get("timing")), styles["Tim"]))
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
    pdf_bytes = buffer.getvalue()
    assert_timing_bytes(pdf_bytes)
    assert_item34_bytes(pdf_bytes)
    return pdf_bytes


def main():
    pack = json.load(sys.stdin)
    sys.stdout.buffer.write(build(pack))


if __name__ == "__main__":
    main()
