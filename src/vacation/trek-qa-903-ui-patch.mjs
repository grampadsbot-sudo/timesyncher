const DETAIL_PAGE_EYEBROW =
  'n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.4,color:"#0f766e",textTransform:"uppercase"},children:"Detail page"})';

const DETAIL_SECTION_HEADING =
  'fontSize:10,fontWeight:900,letterSpacing:1.2,color:"#0f766e",textTransform:"uppercase",marginBottom:6';

export function patchUi903DetailChrome(source = '') {
  let js = String(source || '');
  if (js.includes(DETAIL_PAGE_EYEBROW)) {
    js = js.replaceAll(DETAIL_PAGE_EYEBROW, 'null');
  }
  js = js.replaceAll(
    '{"data-ts-detail-field":"itineraryNote",style:{marginBottom:10,whiteSpace:"pre-wrap",overflowWrap:"anywhere"},children:[n.jsx("strong",{children:"Itinerary note"})',
    `{"data-ts-detail-field":"itineraryNote",style:{marginBottom:10,whiteSpace:"pre-wrap",overflowWrap:"anywhere"},children:[n.jsx("div",{style:{${DETAIL_SECTION_HEADING}},children:"Itinerary note"})`,
  );
  js = js.replaceAll(
    '{"data-ts-detail-field":"longDetails",style:{marginBottom:10,whiteSpace:"pre-wrap",overflowWrap:"anywhere"},children:[n.jsx("strong",{children:"Details"})',
    `{"data-ts-detail-field":"longDetails",style:{marginBottom:10,whiteSpace:"pre-wrap",overflowWrap:"anywhere"},children:[n.jsx("div",{style:{${DETAIL_SECTION_HEADING}},children:"Details"})`,
  );
  return js;
}
