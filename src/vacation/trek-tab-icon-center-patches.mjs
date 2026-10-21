const BOOKINGS_TAB_LUCIDE_ICON_NEEDLE = '}):n.jsx(G.Icon,{size:13}),n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:{lineHeight:1,display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label})';

const BOOKINGS_TAB_LUCIDE_ICON_PATCH = '}):n.jsx("span",{"data-tab-category":String(G.id),"data-ts-category-tab-icon":"1","data-ts-logo-chip":"1","aria-hidden":"true",style:{width:16,height:16,minWidth:16,minHeight:16,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,flex:"0 0 16px",boxSizing:"border-box",alignSelf:"center",transform:"translateY(0.75px)"},children:n.jsx(G.Icon,{size:13})}),n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:{lineHeight:1,display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label})';

const TAB_EMOJI_INK_ANCHOR = 'function pze({places:e=[],dayPlaces:t=[]';

const TAB_EMOJI_LABEL_STYLE_NEEDLE = 'if(label){label.style.lineHeight="1";label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}';
const TAB_EMOJI_LABEL_STYLE_PATCH = 'if(label){label.style.lineHeight="1";if(label.style.display!=="none"){label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}}';

const TAB_EMOJI_INK_TAIL_NEEDLE = 'chip.style.setProperty("top","0px","important");chip.style.setProperty("align-self","center","important")}var btn=chip&&chip.closest("button")';
const TAB_EMOJI_INK_TAIL_PATCH = 'chip.style.setProperty("align-self","center","important")}var btn=chip&&chip.closest("button")';
const TAB_EMOJI_INK_END_NEEDLE = 'if(mass)paint((node.height/2-sum/mass)/dpr)}';
const TAB_EMOJI_INK_END_PATCH = 'if(mass)paint((node.height/2-sum/mass)/dpr);if(chip&&chip.getAttribute("data-ts-category-tab-icon")){var nudge={"\uD83D\uDCC5":1.05,"\uD83D\uDECD\uFE0F":0.35,"\uD83D\uDCB5":0.55};node.style.transform=nudge[emoji]!=null?"translateY("+nudge[emoji]+"px)":"none"}}';

const TAB_EMOJI_INK_NUDGE_UNGUARDED_NEEDLE = 'if(mass)paint((node.height/2-sum/mass)/dpr);var nudge={"\uD83D\uDCC5":1.05,"\uD83D\uDECD\uFE0F":0.35,"\uD83D\uDCB5":0.55};node.style.transform=nudge[emoji]!=null?"translateY("+nudge[emoji]+"px)":"none"}';

const TAB_EMOJI_INK_FN = `function tsPaintTabEmoji(node,emoji){if(!node||!emoji)return;var chip=node.closest("[data-ts-category-tab-icon]")||node.parentElement;if(chip){chip.style.setProperty("display","inline-flex","important");chip.style.setProperty("align-items","center","important");chip.style.setProperty("justify-content","center","important");chip.style.setProperty("line-height","1","important");chip.style.setProperty("position","relative","important");chip.style.setProperty("align-self","center","important")}var btn=chip&&chip.closest("button");if(btn){btn.style.alignItems="center";btn.style.lineHeight="1";var label=[].slice.call(btn.children).filter(function(n){return n!==chip})[0];if(label){label.style.lineHeight="1";if(label.style.display!=="none"){label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}}}var cssSize=16,dpr=2;node.width=cssSize*dpr;node.height=cssSize*dpr;var ctx=node.getContext("2d",{willReadFrequently:true});if(!ctx)return;var cs=getComputedStyle(chip||node);var font=cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily;function paint(shift){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssSize,cssSize);ctx.font=font;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(emoji,cssSize/2,cssSize/2+shift)}paint(0);var img=ctx.getImageData(0,0,node.width,node.height);var sum=0,mass=0,y,x,a;for(y=0;y<node.height;y++){for(x=0;x<node.width;x++){a=img.data[(y*node.width+x)*4+3];if(a<20)continue;sum+=y*a;mass+=a}}if(mass)paint((node.height/2-sum/mass)/dpr);if(chip&&chip.getAttribute("data-ts-category-tab-icon")){var nudge={"\uD83D\uDCC5":1.05,"\uD83D\uDECD\uFE0F":0.35,"\uD83D\uDCB5":0.55};node.style.transform=nudge[emoji]!=null?"translateY("+nudge[emoji]+"px)":"none"}}`;

export function patchTabIconVerticalCenter(js = '') {
  let out = String(js || '');
  if (out.includes(BOOKINGS_TAB_LUCIDE_ICON_NEEDLE)) {
    out = out.replace(BOOKINGS_TAB_LUCIDE_ICON_NEEDLE, BOOKINGS_TAB_LUCIDE_ICON_PATCH);
  } else if (!out.includes('transform:"translateY(0.75px)"},children:n.jsx(G.Icon,{size:13})') && !out.includes('"data-tab-category":String(G.id)')) {
    throw new Error('trek bundle missing lucide tab icon centering patch anchor');
  }
  if (out.includes(TAB_EMOJI_INK_TAIL_NEEDLE)) {
    out = out.replace(TAB_EMOJI_INK_TAIL_NEEDLE, TAB_EMOJI_INK_TAIL_PATCH);
  }
  if (out.includes(TAB_EMOJI_INK_END_NEEDLE) && !out.includes('var nudge={')) {
    out = out.replace(TAB_EMOJI_INK_END_NEEDLE, TAB_EMOJI_INK_END_PATCH);
  } else if (!out.includes('function tsPaintTabEmoji(')) {
    if (!out.includes(TAB_EMOJI_INK_ANCHOR)) {
      throw new Error('trek bundle missing anchor for category tab emoji ink centering');
    }
    out = out.replace(TAB_EMOJI_INK_ANCHOR, `${TAB_EMOJI_INK_FN}${TAB_EMOJI_INK_ANCHOR}`);
  } else if (out.includes(TAB_EMOJI_LABEL_STYLE_NEEDLE)) {
    out = out.replace(TAB_EMOJI_LABEL_STYLE_NEEDLE, TAB_EMOJI_LABEL_STYLE_PATCH);
  } else if (!out.includes('if(label.style.display!=="none")')) {
    throw new Error('trek bundle missing tsPaintTabEmoji mobile label guard');
  } else if (out.includes('chip.style.setProperty("top","0px","important")')) {
    throw new Error('trek bundle must not pin category tab icon top to 0px');
  } else if (out.includes(TAB_EMOJI_INK_NUDGE_UNGUARDED_NEEDLE)) {
    out = out.replace(TAB_EMOJI_INK_NUDGE_UNGUARDED_NEEDLE, TAB_EMOJI_INK_END_PATCH);
  } else if (!out.includes('chip.getAttribute("data-ts-category-tab-icon")')) {
    throw new Error('trek bundle missing per-tab emoji ink nudge map');
  }
  return out;
}
