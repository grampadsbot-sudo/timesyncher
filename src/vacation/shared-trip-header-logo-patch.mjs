export function patchSharedTripHeaderLogo(source) {
  const before = 'dn?n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{children:"TimeSyncher"})';
  const after = 'dn?n.jsxs("div",{"data-ts-shared-header":"1",style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) 34px minmax(0,1fr)",alignItems:"center",gap:5,width:"100%",marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{style:{justifySelf:"end"},children:"TimeSyncher"})';
  const right = 'n.jsx("span",{children:"Vacation"})]})';
  if (!source.includes(before) || !source.includes(right)) throw new Error('served shared header ownership anchor missing');
  return source.replace(before, after).replace(right, 'n.jsx("span",{style:{justifySelf:"start"},children:"Vacation"})]})');
}
