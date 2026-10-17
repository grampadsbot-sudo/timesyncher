export function captureNameText(nameEl) {
        const box = (r) => [r.x, r.y, r.width, r.height];
        const visible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'
            && cs.display !== 'none' && Number(cs.opacity) > 0.05;
        };
        if (!nameEl || !visible(nameEl)) return null;
        const walker = document.createTreeWalker(nameEl, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim() || !visible(node.parentElement)) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const lineBoxes = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0
            && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)
            .map((r) => [r.x, r.y, r.width, r.height]);
          if (lineBoxes.length) return { text: node.textContent.trim().slice(0, 80),
            box: box(node.parentElement.getBoundingClientRect()), visible: true, line_boxes: lineBoxes };
        }
        return null;
      }
