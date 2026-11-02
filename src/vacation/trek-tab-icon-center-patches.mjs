const TAB_VECTOR_ICON_NEEDLE = '}):n.jsx(G.Icon,{size:13}),n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:{lineHeight:1,display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label})';
const TAB_VECTOR_ICON_PATCH = '}):n.jsx("span",{"data-ts-category-tab-icon":"1","aria-hidden":"true",style:{width:16,height:16,minWidth:16,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,flex:"0 0 16px",alignSelf:"center"},children:n.jsx(G.Icon,{size:13})}),n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:{lineHeight:1,display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label})';

export function patchTabIconVerticalCenter(source = '') {
  const js = String(source || '');
  if (js.includes(TAB_VECTOR_ICON_NEEDLE)) return js.replace(TAB_VECTOR_ICON_NEEDLE, TAB_VECTOR_ICON_PATCH);
  if (js.includes(TAB_VECTOR_ICON_PATCH)) return js;
  throw new Error('trek bundle missing category tab vector icon centering anchor');
}
